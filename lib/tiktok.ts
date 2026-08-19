import { RawProfile, Post, SearchUserResult } from '@/types'
import { recordApiCall, recordProviderOutcome, isProviderCircuitOpen, readCostPerCallUsd } from '@/lib/api-governance'

/** 评估链路审计上下文：随 fetchProfile 传入，落到 api_call_logs（review_id / purchase_type 归属） */
export interface AuditCtx {
  reviewId?: string
  purchaseType?: string
}

/** 重试配置 */
const MAX_RETRIES = 2          // 每个 key 最多重试 2 次（共 3 次尝试）
const RETRY_DELAYS = [600, 1500]  // 退避延迟（ms），指数增长

// ========== Provider 抽象层 ==========

/**
 * Provider 配置：一个 host + 对应的 API key
 * 环境变量格式：TIKTOK_PROVIDERS="host1:key1,host2:key2"
 * 向后兼容：若未配置 TIKTOK_PROVIDERS，回退到 RAPIDAPI_KEYS/RAPIDAPI_KEY + 默认 host
 */
export interface ProviderConfig {
  host: string
  apiKey: string
}

const DEFAULT_HOST = 'tiktok-api6.p.rapidapi.com'

/**
 * 动态读取 provider 列表（每次调用时读取，支持 env 热更新）
 * 优先级：TIKTOK_PROVIDERS > RAPIDAPI_KEYS > RAPIDAPI_KEY
 */
function getProviders(): ProviderConfig[] {
  // 优先：多 host 多 key 配置 "host1:key1,host2:key2"
  const multi = process.env.TIKTOK_PROVIDERS
  if (multi) {
    const providers = multi.split(',')
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => {
        const [host, key] = entry.split(':').map(s => s.trim())
        return host && key ? { host, apiKey: key } : null
      })
      .filter((p): p is ProviderConfig => p !== null)
    if (providers.length) return providers
  }

  // 回退 1：多 key + 默认 host
  const multiKey = process.env.RAPIDAPI_KEYS
  if (multiKey) {
    const keys = multiKey.split(',').map(k => k.trim()).filter(Boolean)
    if (keys.length) return keys.map(key => ({ host: DEFAULT_HOST, apiKey: key }))
  }

  // 回退 2：单 key + 默认 host
  const single = process.env.RAPIDAPI_KEY
  return single ? [{ host: DEFAULT_HOST, apiKey: single }] : []
}

function apiHeaders(host: string, apiKey: string) {
  return {
    'x-rapidapi-key': apiKey,
    'x-rapidapi-host': host,
    'Content-Type': 'application/json',
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeUsername(input: string): string {
  return input.trim().replace(/^@/, '').toLowerCase()
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    // 支持 "1.5M"/"10K"/"2.3B" 缩写与 "1,234" 逗号分隔格式
    const match = value.trim().match(/^([\d.,]+)\s*([kmb])?$/i)
    if (!match) return 0
    const num = parseFloat(match[1].replace(/,/g, ''))
    if (Number.isNaN(num)) return 0
    const suffix = match[2]?.toLowerCase()
    const multiplier = suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : 1
    return num * multiplier
  }
  return 0
}

function pickField(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in obj) return obj[key]
  }
  return undefined
}

class TikTokApiError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

// ========== 语言检测 → 地区推断 ==========

/** 基于文本内容推断账号所属地区（当 API 未返回 region 时使用） */
function inferRegionFromContent(bio: string, nickname: string, posts: Post[]): string | undefined {
  const postsText = posts.slice(0, 10).map(p => p.desc || '').join(' ')
  const text = `${nickname} ${bio} ${postsText}`.toLowerCase()

  const detectors: { test: (t: string) => number; region: string }[] = [
    // 德语：äöüß + 常见德语词
    { test: (t) => {
      const umlauts = (t.match(/[äöüß]/g) || []).length
      const words = (t.match(/\b(und|der|die|das|ich|nicht|mit|von|sich|auch|auf|für|ist|ein|eine|einen|im|als|wie|bei|nach|aus|über|oder|aber|wenn|dann|dass|schon|kann|habe|haben|wird|wurde|gemacht|video|videos|neu|heute|mehr|folgen|liken|kommentar|kommentare|danke|bitte|hallo|guten|morgen|abend|leute|freunde)\b/g) || []).length
      return umlauts * 3 + words * 2
    }, region: 'DE' },

    // 法语：éèêëàâîïôûç + 常见法语词
    { test: (t) => {
      const accents = (t.match(/[éèêëàâîïôûùçœ]/g) || []).length
      const words = (t.match(/\b(le|la|les|des|une|une|est|pas|que|qui|dans|pour|sur|avec|plus|bien|fait|faire|comme|tout|tous|aussi|leur|leurs|mon|mes|ton|tes|son|ses|notre|nos|votre|vos|bonjour|merci|salut|vidéo|vidéos|abonne|abonner|jaime|partage|partager|commentaire|nouveau|nouvelle|aujourdhui|demain|hier|français|france|paris)\b/g) || []).length
      return accents * 3 + words * 2
    }, region: 'FR' },

    // 西班牙语：ñ + 常见西语词
    { test: (t) => {
      const nTilde = (t.match(/ñ/g) || []).length
      const words = (t.match(/\b(el|la|los|las|un|una|unos|unas|de|en|que|por|para|con|sin|más|muy|pero|también|como|porque|cuando|donde|todo|todos|este|esta|estos|estas|ese|esa|esos|esas|aquel|mi|mis|tu|tus|su|sus|nuestro|nuestra|hola|gracias|buenos|buenas|días|tardes|noches|video|videos|nuevo|nueva|hoy|mañana|ayer|español|españa|mexico|méxico|argentina|colombia|chile|peru|perú)\b/g) || []).length
      return nTilde * 3 + words * 2
    }, region: 'ES' },

    // 葡萄牙语：ãõ + 常见葡语词
    { test: (t) => {
      const special = (t.match(/[ãõáéíóúâêôàèìòùç]/g) || []).length
      const words = (t.match(/\b(o|a|os|as|de|da|do|das|dos|em|no|na|nos|nas|que|não|para|com|por|mais|muito|bem|também|como|quando|onde|tudo|todos|este|esta|esse|essa|meu|minha|seus|suas|nosso|nossa|olá|obrigado|obrigada|bom|boa|dia|tarde|noite|video|vídeo|videos|vídeos|novo|nova|hoje|amanhã|ontem|brasil|portugal|rio|são|paulo)\b/g) || []).length
      return special * 2 + words * 2
    }, region: 'BR' },

    // 日语：平假名/片假名
    { test: (t) => {
      const hiragana = (t.match(/[\u3040-\u309f]/g) || []).length
      const katakana = (t.match(/[\u30a0-\u30ff]/g) || []).length
      return hiragana * 5 + katakana * 3
    }, region: 'JP' },

    // 韩语：谚文
    { test: (t) => {
      const hangul = (t.match(/[\uac00-\ud7af]/g) || []).length
      return hangul * 5
    }, region: 'KR' },

    // 阿拉伯语
    { test: (t) => {
      const arabic = (t.match(/[\u0600-\u06ff]/g) || []).length
      if (arabic > 10) return arabic
      const words = (t.match(/\b(ال|من|في|على|أن|هذا|هذه|هو|هي|مع|عن|كان|كانت|ليس|ليس|ما|لا|كل|بعض|أي|أو|ثم|إذا|لكن|حيث|مثل|عند|بعد|قبل|فوق|تحت|خلال|داخل|خارج|اليوم|غدا|أمس|فيديو|فيديوهات|جديد|جديدة|شكرا|مرحبا|السلام|عليكم)\b/g) || []).length
      return words * 3
    }, region: 'SA' },

    // 俄语：西里尔字母
    { test: (t) => {
      const cyrillic = (t.match(/[\u0400-\u04ff]/g) || []).length
      return cyrillic * 5
    }, region: 'RU' },

    // 泰语
    { test: (t) => {
      const thai = (t.match(/[\u0e00-\u0e7f]/g) || []).length
      return thai * 5
    }, region: 'TH' },

    // 越南语：âêôơư + 常见越语词
    { test: (t) => {
      const special = (t.match(/[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựýỳỷỹỵđ]/g) || []).length
      if (special > 3) return special * 2
      const words = (t.match(/\b(của|và|một|không|có|được|trong|cho|những|với|các|đã|này|đó|tôi|bạn|anh|em|chị|video|mới|hôm|nay|cảm|ơn|chào|buổi|sáng|trưa|chiều|tối|việt|nam)\b/g) || []).length
      return words * 3
    }, region: 'VN' },

    // 印尼语/马来语
    { test: (t) => {
      const words = (t.match(/\b(dan|yang|di|ke|dari|ini|itu|saya|kamu|dia|mereka|kita|kami|anda|tidak|bisa|akan|sudah|belum|ada|juga|atau|kalau|karena|tapi|untuk|dengan|seperti|tentang|setelah|sebelum|baru|video|hari|ini|terima|kasih|selamat|pagi|siang|sore|malam|indonesia|malaysia|singapore|singapura|jakarta|kuala|lumpur)\b/g) || []).length
      return words * 3
    }, region: 'ID' },

    // 印地语（天城文）
    { test: (t) => {
      const devanagari = (t.match(/[\u0900-\u097f]/g) || []).length
      return devanagari * 5
    }, region: 'IN' },

    // 土耳其语
    { test: (t) => {
      const special = (t.match(/[ğüşıöçİĞÜŞÖÇ]/g) || []).length
      if (special > 3) return special * 3
      const words = (t.match(/\b(ve|bir|bu|de|da|ne|ben|sen|o|biz|siz|onlar|var|yok|çok|daha|ama|çünkü|için|gibi|kadar|sonra|önce|şimdi|bugün|yarın|video|yeni|teşekkür|merhaba|selam|türkiye|istanbul|ankara|izmir)\b/g) || []).length
      return words * 3
    }, region: 'TR' },

    // 波兰语
    { test: (t) => {
      const special = (t.match(/[ąćęłńóśźż]/g) || []).length
      if (special > 3) return special * 3
      const words = (t.match(/\b(i|w|na|z|do|nie|to|że|się|jest|być|był|była|było|dla|ale|jak|co|ten|ta|to|te|mój|moja|moje|twój|twoja|twoje|jego|jej|ich|nasz|nasza|nasze|wasz|wasza|wasze|dziękuję|cześć|dzień|dobry|video|nowy|nowa|nowe|polska|polski|polskie|warszawa|kraków)\b/g) || []).length
      return words * 3
    }, region: 'PL' },

    // 希腊语：希腊字母
    { test: (t) => {
      const greek = (t.match(/[\u0370-\u03ff]/g) || []).length
      if (greek > 5) return greek * 5
      const words = (t.match(/\b(και|το|η|ο|τα|οι|του|των|της|τον|την|στην|στο|στα|από|με|σε|για|που|αυτό|αυτή|αυτός|είναι|δεν|θα|να|ένα|μια|έχω|έχει|κάνω|κάνει|τώρα|σήμερα|αύριο|χθες|βίντεο|νέο|νέα|ευχαριστώ|γεια|καλημέρα|καλησπέρα|ελλάδα|αθήνα|θεσσαλονίκη)\b/g) || []).length
      return words * 3
    }, region: 'GR' },

    // 乌克兰语：西里尔字母 + 乌克兰语特有字符
    { test: (t) => {
      const cyrillic = (t.match(/[\u0400-\u04ff]/g) || []).length
      const ukrSpecific = (t.match(/[іїєґ]/g) || []).length
      if (ukrSpecific > 3) return cyrillic * 3 + ukrSpecific * 5
      const words = (t.match(/\b(і|та|в|на|з|до|не|це|що|як|він|вона|вони|ми|ви|ти|я|є|був|була|було|для|але|коли|де|чому|тому|відео|новий|нова|нове|сьогодні|завтра|вчора|дякую|привіт|добрий|день|україна|київ|львів|харків|одеса)\b/g) || []).length
      return words * 3
    }, region: 'UA' },

    // 芬兰语
    { test: (t) => {
      const special = (t.match(/[äöå]/g) || []).length
      if (special > 3) return special * 3
      const words = (t.match(/\b(ja|on|ei|että|se|hän|mitä|kun|niin|kuin|jos|olen|olet|olemme|olette|ovat|oli|ollut|minä|sinä|me|te|he|tämä|tuo|se|nämä|nuo|ne|video|uusi|uutta|tänään|huomenna|eilen|kiitos|hei|moi|terve|huomenta|päivää|iltaa|suomi|helsinki|tampere|turun|espoo|oulu)\b/g) || []).length
      return words * 3
    }, region: 'FI' },

    // 罗马尼亚语
    { test: (t) => {
      const special = (t.match(/[ăâîșț]/g) || []).length
      if (special > 3) return special * 3
      const words = (t.match(/\b(si|de|la|cu|din|pe|pentru|care|este|sunt|fost|un|o|în|sau|dar|dacă|mai|ca|și|nu|da|acest|această|meu|mea|tău|ta|noi|voi|ei|ele|video|nou|nouă|astăzi|mâine|ieri|mulțumesc|salut|bună|ziua|seara|românia|bucurești|cluj|timisoara|iasi|constanta)\b/g) || []).length
      return words * 3
    }, region: 'RO' },

    // 匈牙利语
    { test: (t) => {
      const special = (t.match(/[áéíóúöüőű]/g) || []).length
      if (special > 3) return special * 3
      const words = (t.match(/\b(és|nem|hogy|egy|ez|az|de|is|ha|már|csak|még|van|volt|lesz|vagyok|vagy|van|vannak|én|te|ő|mi|ti|ők|video|új|ma|holnap|tegnap|köszönöm|szia|helló|jó|reggelt|napot|estét|magyarország|budapest|debrecen|szeged|pécs|győr|miskolc)\b/g) || []).length
      return words * 3
    }, region: 'HU' },

    // 捷克语
    { test: (t) => {
      const special = (t.match(/[áčďéěíňóřšťúůýž]/g) || []).length
      if (special > 3) return special * 3
      const words = (t.match(/\b(a|je|se|na|s|do|k|o|od|pro|před|po|při|za|ale|nebo|protože|když|jak|co|kdo|kde|kdy|proč|já|ty|on|ona|my|vy|oni|video|nový|nová|nové|dnes|zítra|včera|děkuji|ahoj|dobrý|den|večer|česká|republika|praha|brno|ostrava|plzeň|liberec|olomouc)\b/g) || []).length
      return words * 3
    }, region: 'CZ' },

    // 挪威语/丹麦语
    { test: (t) => {
      const special = (t.match(/[æøå]/g) || []).length
      if (special > 3) return special * 3
      const words = (t.match(/\b(og|er|det|jeg|du|vi|de|han|hun|den|det|ikke|har|var|kan|skal|vil|må|for|med|på|til|om|fra|ved|men|eller|som|at|når|hvis|da|så|video|ny|nytt|nye|i dag|i morgen|i går|takk|hei|hallo|god|morgen|dag|kveld|norge|norsk|danmark|dansk|oslo|bergen|stavanger|trondheim|københavn|århus|odense|aalborg)\b/g) || []).length
      return words * 3
    }, region: 'NO' },

    // 葡萄牙语（葡萄牙）
    { test: (t) => {
      const words = (t.match(/\b(portugal|lisboa|porto|algarve|coimbra|braga|funchal|açores|madeira|alentejo|português|portuguesa|portugueses|tu|você|vocês|ele|ela|eles|elas|está|estão|obrigado|obrigada|olá|bom dia|boa tarde|boa noite|fixe|giro|gira|bué|tuga|tugão)\b/g) || []).length
      return words * 4
    }, region: 'PT' },

    // 中文（繁体优先：命中繁体特征字→TW，否则简体→CN）
    { test: (t) => {
      const han = (t.match(/[\u4e00-\u9fff]/g) || []).length
      if (han < 4) return 0 // 汉字太少不判断
      const traditional = (t.match(/[們這來時裡後為說對過讓還點樣麼書龍國語體壇學藝傳經濟觀點轉發複習選擇公開與灣臺鄉間個於無發關東樂車馬門風飛魚鳥萬長開兒實覺際體會現獨習畫話讀誰變處歲從當幹麼製鐘鈡點線還進遠裡邊價買賣錢課謝您幹嗎話語詞彙認知識題數歲月份週禮樂歡慶]/g) || []).length
      return han * 4 + traditional * 6
    }, region: 'TW' },

    // 简体中文（放在繁体之后，命中简体特征字时）
    { test: (t) => {
      const han = (t.match(/[\u4e00-\u9fff]/g) || []).length
      if (han < 4) return 0
      const simplified = (t.match(/[们这来时里后为说对过让还点样么书龙国语体坛学艺传经济观点转发复习选择公开与湾乡间个于无发关东乐车马门风飞鱼鸟万长开儿实觉际体会现独习画话读谁变处岁从当干么制钟点线还进远里边价买卖钱课谢您干吗话语词汇认知识题数岁月份周礼乐欢庆]/g) || []).length
      return han * 4 + simplified * 6
    }, region: 'CN' },

    // 英语（兜底检测，放在最后避免误判）
    // 只有英文内容占比极高（>80% ASCII）且没有其他语言特征时才会命中
    { test: (t) => {
      // 移除 URL、mention、hashtag 后计算纯文本
      const clean = t.replace(/https?:\/\/\S+/g, '').replace(/@\S+/g, '').replace(/#\S+/g, '')
      if (clean.length < 30) return 0 // 文本太短不判断
      const asciiChars = (clean.match(/[a-zA-Z0-9\s.,!?;:'"()\-–—&/+]/g) || []).length
      const totalChars = clean.replace(/\s/g, '').length
      if (totalChars === 0) return 0
      const asciiRatio = asciiChars / totalChars
      if (asciiRatio < 0.8) return 0 // 非英文字符太多，不是英语内容

      // 常见英文高频词 + TikTok 平台术语
      const words = (t.match(/\b(the|and|that|for|are|with|his|they|this|have|from|was|not|but|all|can|were|her|she|has|been|will|when|who|more|some|would|about|like|just|what|know|think|really|because|make|people|right|also|even|only|still|being|than|then|into|over|back|after|year|good|life|world|video|videos|like|follow|share|comment|subscribe|check|link|bio|new|daily|content|creator|viral|fyp|foryou|tiktok|post|watch|trending|love|best|top|how|why|tips|hack|review|tutorial|unboxing|grwm|pov|vlog|storytime|reaction|challenge|duet|stitch)\b/g) || []).length
      return 5 + words * 2 // 基础分 5 + 每词 2 分
    }, region: 'US' },
  ]

  let bestMatch: { region: string; score: number } | null = null
  for (const d of detectors) {
    const score = d.test(text)
    if (score > 0 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { region: d.region, score }
    }
  }

  // 需要显著信号才推断（score >= 5），避免误判
  return bestMatch && bestMatch.score >= 5 ? bestMatch.region : undefined
}

// ========== 通用 HTTP 请求（单个 provider，支持 GET/POST） ==========

async function apiCallSingle(
  provider: ProviderConfig,
  method: 'GET' | 'POST',
  path: string,
  body: Record<string, unknown> | undefined,
  label: string,
  options: { timeoutMs?: number; throwOnError?: boolean; audit?: AuditCtx } = {}
): Promise<Record<string, unknown>> {
  const fnStart = Date.now()
  let callOk = false
  const { host, apiKey } = provider
  const { timeoutMs = 15000, throwOnError = true, audit } = options
  const url = `https://${host}${path}`
  const providerTag = host

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const start = Date.now()
      let res: Response
      try {
        const opts: RequestInit = {
          method,
          headers: apiHeaders(host, apiKey),
          cache: 'no-store',
          signal: AbortSignal.timeout(timeoutMs),
        }
        if (method === 'POST' && body) {
          opts.body = JSON.stringify(body)
        }
        res = await fetch(url, opts)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
        const isNetwork = isTimeout || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('EAI_AGAIN') || msg.includes('EPIPE')

        if (isNetwork) {
          const code = isTimeout ? 'Request timed out' : `Network error: ${msg}`
          console.warn(`[tiktok] ${label} ${providerTag} attempt#${attempt + 1} network error: ${msg}`)
          if (attempt < MAX_RETRIES) {
            await sleep(RETRY_DELAYS[attempt])
            continue
          }
          throw new TikTokApiError(code, 'NETWORK_ERROR', 502)
        }
        throw err  // 未知异常不重试
      }

      // 限流/配额：抛错，由上层切换 provider
      if (res.status === 429 || res.status === 403) {
        console.warn(`[tiktok] ${label} ${providerTag} attempt#${attempt + 1} HTTP ${res.status} (rate/quota)`)
        throw new TikTokApiError('Rate limited', 'RATE_LIMIT', 429)
      }

      const text = await res.text()
      const duration = Date.now() - start

      if (!res.ok) {
        console.error(`[tiktok] ${label} ${providerTag} HTTP ${res.status} (${duration}ms):`, text.slice(0, 300))
        // 5xx 服务端错误可重试
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt])
          continue
        }
        if (!throwOnError) return {}
        throw new TikTokApiError(`API HTTP ${res.status}`, 'API_ERROR', 500)
      }

      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        console.error(`[tiktok] ${label} ${providerTag} invalid JSON (${duration}ms):`, text.slice(0, 200))
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt])
          continue
        }
        if (!throwOnError) return {}
        throw new TikTokApiError('Invalid API response', 'API_ERROR', 500)
      }

      const root = json as Record<string, unknown>

      // 错误格式：{ detail: "User xxx does not exist" } 或 { message: "..." }
      const detailMsg = typeof root.detail === 'string' ? root.detail : ''
      const errMsg = typeof root.message === 'string' ? root.message : detailMsg

      if (errMsg) {
        if (/does not exist|not found|no user|user not found|invalid/i.test(errMsg)) {
          if (!throwOnError) return {}
          callOk = true // provider HTTP 往返正常，业务性 404 不计熔断
          throw new TikTokApiError(errMsg, 'USER_NOT_FOUND', 404)
        }
        if (/rate limit|quota|too many/i.test(errMsg)) {
          console.warn(`[tiktok] ${label} ${providerTag} response rate limit`)
          throw new TikTokApiError(errMsg, 'RATE_LIMIT', 429)
        }
        if (/endpoint.*does not exist/i.test(errMsg)) {
          console.error(`[tiktok] ${label} ${providerTag} endpoint error:`, errMsg)
          if (!throwOnError) return {}
          throw new TikTokApiError(errMsg, 'API_ERROR', 500)
        }
      }

      console.log(`[tiktok] ${label} ${providerTag} OK (${duration}ms)`)
      callOk = true
      return root
    }

    throw new TikTokApiError('Request failed after retries', 'API_ERROR', 500)
  } finally {
    const durationMs = Date.now() - fnStart
    recordProviderOutcome(host, callOk).catch(() => {})
    recordApiCall({
      host,
      endpoint: label,
      ok: callOk,
      durationMs,
      costUsd: callOk ? readCostPerCallUsd() : 0,
      reviewId: audit?.reviewId ?? null,
      purchaseType: audit?.purchaseType ?? null,
    }).catch(() => {})
  }
}

// ========== Provider 适配器 ==========

// Spec §3 合规：对外导出的 provider 适配器接口（formalize 为 TikTokProviderAdapter）
export type TikTokProviderAdapter = ProviderAdapter

interface ProviderAdapter {
  name: string
  /** 获取用户资料（含视频），返回标准 RawProfile */
  fetchProfile(username: string, provider: ProviderConfig, audit?: AuditCtx): Promise<RawProfile>
}

// --- tiktok-api6 适配器（POST 请求，当前默认） ---
const API6_ADAPTER: ProviderAdapter = {
  name: 'tiktok-api6',
  async fetchProfile(username, provider, audit) {
    const [info, posts] = await Promise.all([
      apiCallSingle(provider, 'POST', '/user/details', { username }, 'user/details', { timeoutMs: 20000, audit }),
      fetchPostsApi6(username, provider, audit),
    ])

    const followerCount = toNumber(pickField(info, 'followers', 'follower_count', 'followerCount'))
    const videoCount = toNumber(pickField(info, 'total_videos', 'video_count', 'videoCount'))
    const totalLikes = toNumber(pickField(info, 'total_heart', 'heart_count', 'total_favorited'))
    const nickname = String(pickField(info, 'nickname', 'username') || username)
    const secUid = String(pickField(info, 'secondary_id', 'sec_uid', 'secUid') || '')

    if (!followerCount && !videoCount && !nickname) {
      throw new TikTokApiError('User has empty stats', 'USER_NOT_FOUND', 404)
    }

    const postsFetched = posts.length > 0
    return {
      username, nickname, followerCount,
      followingCount: toNumber(pickField(info, 'following', 'following_count', 'followingCount')),
      totalLikes, videoCount, secUid,
      region: info.region ? String(info.region) : inferRegionFromContent(nickname, String(pickField(info, 'description', 'signature') || ''), posts),
      avatar: String(pickField(info, 'profile_image', 'avatar_larger', 'avatar_medium', 'avatar_thumb') || ''),
      bio: String(pickField(info, 'description', 'signature') || ''),
      posts,
      dataQuality: postsFetched ? 'full' as const : 'partial' as const,
      postsFetchError: postsFetched ? undefined : 'Video data unavailable — evaluation may be less accurate',
    }
  },
}

// --- tiktok-api23 适配器（GET 请求） ---
const API23_ADAPTER: ProviderAdapter = {
  name: 'tiktok-api23',
  async fetchProfile(username, provider, audit) {
    const path = `/api/user/info?uniqueId=${encodeURIComponent(username)}`
    const root = await apiCallSingle(provider, 'GET', path, undefined, 'user/info', { timeoutMs: 20000, audit })
    const userInfo = root.userInfo as Record<string, unknown> | undefined
    if (!userInfo) throw new TikTokApiError('Empty response', 'API_ERROR', 500)
    const user = (userInfo.user as Record<string, unknown>) || {}
    const stats = (userInfo.stats as Record<string, unknown>) || {}

    const followerCount = toNumber(stats.followerCount ?? stats.follower_count)
    const videoCount = toNumber(stats.videoCount ?? stats.video_count)
    const totalLikes = toNumber(stats.heart ?? stats.heartCount ?? stats.likeCount)
    const nickname = String(user.nickname || username)
    const secUid = String(user.secUid ?? (user.sec_uid || ''))

    if (!followerCount && !videoCount && !nickname) {
      throw new TikTokApiError('User has empty stats', 'USER_NOT_FOUND', 404)
    }

    // 视频端点需要 secUid
    const posts = await fetchPostsApi23(username, secUid, provider, audit)
    const postsFetched = posts.length > 0
    return {
      username, nickname, followerCount,
      followingCount: toNumber(stats.followingCount ?? stats.following_count),
      totalLikes, videoCount, secUid,
      region: inferRegionFromContent(nickname, String(user.signature || ''), posts),
      avatar: String(user.avatarLarger ?? (user.avatar_larger ?? (user.avatarThumb || ''))),
      bio: String(user.signature || ''),
      posts,
      dataQuality: postsFetched ? 'full' as const : 'partial' as const,
      postsFetchError: postsFetched ? undefined : 'Video data unavailable — evaluation may be less accurate',
    }
  },
}

// --- tiktok-scraper7 适配器（GET 请求） ---
const SCRAPER7_ADAPTER: ProviderAdapter = {
  name: 'tiktok-scraper7',
  async fetchProfile(username, provider, audit) {
    const path = `/user/info?unique_id=${encodeURIComponent(username)}`
    const root = await apiCallSingle(provider, 'GET', path, undefined, 'user/info', { timeoutMs: 20000, audit })
    const data = root.data as Record<string, unknown> | undefined
    if (!data) throw new TikTokApiError('Empty response', 'API_ERROR', 500)
    const user = (data.user as Record<string, unknown>) || {}
    const stats = (data.stats as Record<string, unknown>) || {}

    const followerCount = toNumber(stats.followerCount ?? stats.follower_count)
    const videoCount = toNumber(stats.videoCount ?? stats.video_count)
    const totalLikes = toNumber(stats.heart ?? stats.heartCount)
    const nickname = String(user.nickname || username)
    const secUid = String(user.secUid ?? (user.sec_uid || ''))

    if (!followerCount && !videoCount && !nickname) {
      throw new TikTokApiError('User has empty stats', 'USER_NOT_FOUND', 404)
    }

    const posts = await fetchPostsScraper7(username, provider, audit)
    const postsFetched = posts.length > 0
    return {
      username, nickname, followerCount,
      followingCount: toNumber(stats.followingCount ?? stats.following_count),
      totalLikes, videoCount, secUid,
      region: inferRegionFromContent(nickname, String(user.signature || ''), posts),
      avatar: String(user.avatarLarger ?? (user.avatar_thumb || '')),
      bio: String(user.signature || ''),
      posts,
      dataQuality: postsFetched ? 'full' as const : 'partial' as const,
      postsFetchError: postsFetched ? undefined : 'Video data unavailable — evaluation may be less accurate',
    }
  },
}

// Host → 适配器映射
const ADAPTERS: Record<string, ProviderAdapter> = {
  'tiktok-api6.p.rapidapi.com': API6_ADAPTER,
  'tiktok-api23.p.rapidapi.com': API23_ADAPTER,
  'tiktok-scraper7.p.rapidapi.com': SCRAPER7_ADAPTER,
}

// ========== fetchProfile：多 provider 遍历 ==========

export async function fetchProfile(inputUsername: string, audit?: AuditCtx): Promise<RawProfile> {
  const username = normalizeUsername(inputUsername)
  if (!username) throw new TikTokApiError('Empty username', 'INVALID_USERNAME', 400)

  const all = getProviders()
  if (all.length === 0) {
    throw new TikTokApiError('RAPIDAPI_KEY not configured', 'MISSING_API_KEY', 503)
  }

  // ── B2 熔断过滤：跳过 open_until 未到期的供应商；全部熔断时 fail-open 放行 ──
  const openFlags = await Promise.all(all.map(p => isProviderCircuitOpen(p.host)))
  let providers = all.filter((_, i) => !openFlags[i])
  if (providers.length === 0) {
    console.warn('[tiktok] all providers circuit-open — failing open')
    providers = all
  }

  let lastError: unknown = null

  for (const provider of providers) {
    const adapter = ADAPTERS[provider.host]
    if (!adapter) {
      console.warn(`[tiktok] no adapter for host ${provider.host}, skipping`)
      continue
    }
    try {
      console.log(`[tiktok] trying ${adapter.name} (${provider.host})`)
      const t0 = Date.now()
      const profile = await adapter.fetchProfile(username, provider, audit)
      // profile 级汇总审计（字段缺失观测）：dataQuality / postCount / secUid 是否齐全
      recordApiCall({
        host: provider.host,
        endpoint: 'profile_summary',
        ok: true,
        durationMs: Date.now() - t0,
        costUsd: 0,
        reviewId: audit?.reviewId ?? null,
        purchaseType: audit?.purchaseType ?? null,
        meta: {
          dataQuality: profile.dataQuality,
          postCount: profile.posts?.length ?? 0,
          secUidPresent: !!profile.secUid,
        },
      }).catch(() => {})
      return profile
    } catch (err) {
      // USER_NOT_FOUND 不切换 provider
      if (err instanceof TikTokApiError && err.code === 'USER_NOT_FOUND') throw err
      lastError = err
      console.warn(`[tiktok] ${adapter.name} failed: ${err instanceof Error ? err.message : err}, trying next provider...`)
    }
  }

  throw lastError || new TikTokApiError('All providers exhausted', 'API_ERROR', 500)
}

// ========== 各 host 的视频获取函数 ==========

// tiktok-api6: POST /user/videos
async function fetchPostsApi6(username: string, provider: ProviderConfig, audit?: AuditCtx): Promise<Post[]> {
  try {
    const root = await apiCallSingle(provider, 'POST', '/user/videos', { username, count: 30, cursor: 0 }, 'user/videos', { timeoutMs: 12000, audit })
    const items = Array.isArray(root.videos) ? root.videos : []
    return items.map((v: unknown): Post => {
      const item = (v && typeof v === 'object') ? (v as Record<string, unknown>) : {}
      const stats = (item.statistics && typeof item.statistics === 'object') ? (item.statistics as Record<string, unknown>) : {}
      return {
        id: String(item.video_id ?? item.aweme_id ?? item.id ?? ''),
        playCount: toNumber(pickField(stats, 'number_of_plays', 'play_count', 'playCount')),
        likeCount: toNumber(pickField(stats, 'number_of_hearts', 'digg_count', 'like_count')),
        commentCount: toNumber(pickField(stats, 'number_of_comments', 'comment_count', 'commentCount')),
        shareCount: toNumber(pickField(stats, 'number_of_reposts', 'share_count', 'shareCount')),
        createTime: toNumber(item.create_time ?? item.createTime),
        desc: String(item.description ?? item.desc ?? item.title ?? ''),
      }
    }).filter(p => p.id)
  } catch (err) {
    console.warn(`[tiktok] ${provider.host} user/videos failed:`, err instanceof Error ? err.message : err)
    return []
  }
}

// tiktok-api23: GET /api/user/posts?uniqueId=xxx&secUid=yyy
async function fetchPostsApi23(username: string, secUid: string, provider: ProviderConfig, audit?: AuditCtx): Promise<Post[]> {
  if (!secUid) return []
  try {
    const path = `/api/user/posts?uniqueId=${encodeURIComponent(username)}&secUid=${encodeURIComponent(secUid)}&count=30`
    const root = await apiCallSingle(provider, 'GET', path, undefined, 'user/posts', { timeoutMs: 12000, audit })
    const rootData = root.data as Record<string, unknown> | undefined
    const items: unknown[] = Array.isArray(root.videos) ? root.videos : (Array.isArray(rootData?.videos) ? rootData!.videos : [])
    return items.map((v: unknown): Post => {
      const item = (v && typeof v === 'object') ? (v as Record<string, unknown>) : {}
      const stats = (item.stats && typeof item.stats === 'object') ? (item.stats as Record<string, unknown>) : {}
      return {
        id: String(item.id ?? item.aweme_id ?? item.video_id ?? ''),
        playCount: toNumber(pickField(stats, 'playCount', 'play_count')),
        likeCount: toNumber(pickField(stats, 'diggCount', 'digg_count')),
        commentCount: toNumber(pickField(stats, 'commentCount', 'comment_count')),
        shareCount: toNumber(pickField(stats, 'shareCount', 'share_count')),
        createTime: toNumber(item.createTime ?? item.create_time),
        desc: String(item.desc ?? item.description ?? item.title ?? ''),
      }
    }).filter(p => p.id)
  } catch (err) {
    console.warn(`[tiktok] ${provider.host} user/posts failed:`, err instanceof Error ? err.message : err)
    return []
  }
}

// tiktok-scraper7: GET /user/posts?unique_id=xxx
async function fetchPostsScraper7(username: string, provider: ProviderConfig, audit?: AuditCtx): Promise<Post[]> {
  try {
    const path = `/user/posts?unique_id=${encodeURIComponent(username)}&count=30`
    const root = await apiCallSingle(provider, 'GET', path, undefined, 'user/posts', { timeoutMs: 12000, audit })
    const rootData = root.data as Record<string, unknown> | undefined
    const items: unknown[] = Array.isArray(rootData?.videos) ? rootData!.videos : []
    return items.map((v: unknown): Post => {
      const item = (v && typeof v === 'object') ? (v as Record<string, unknown>) : {}
      // scraper7 的字段直接在根对象上
      return {
        id: String(item.aweme_id ?? item.video_id ?? item.id ?? ''),
        playCount: toNumber(item.play_count ?? item.playCount),
        likeCount: toNumber(item.digg_count ?? item.diggCount),
        commentCount: toNumber(item.comment_count ?? item.commentCount),
        shareCount: toNumber(item.share_count ?? item.shareCount),
        createTime: toNumber(item.create_time ?? item.createTime),
        desc: String(item.title ?? item.content_desc ?? item.desc ?? ''),
      }
    }).filter(p => p.id)
  } catch (err) {
    console.warn(`[tiktok] ${provider.host} user/posts failed:`, err instanceof Error ? err.message : err)
    return []
  }
}

// ========== 搜索：仅 tiktok-api6 支持 ==========

export async function searchUsers(keywords: string, count = 10): Promise<SearchUserResult[]> {
  const providers = getProviders()
  if (providers.length === 0) return []

  // 只用支持搜索的 provider（当前仅 tiktok-api6）
  for (const provider of providers) {
    if (!ADAPTERS[provider.host] || provider.host !== 'tiktok-api6.p.rapidapi.com') continue
    try {
      const root = await apiCallSingle(
        provider, 'POST', '/search/general/query',
        { query: keywords, cursor: 0, sort_type: '0' },
        'search/general/query'
      )
      const videos = Array.isArray(root.videos) ? root.videos : []
      const seen = new Set<string>()
      const results: SearchUserResult[] = []
      for (const v of videos) {
        const item = (v && typeof v === 'object') ? (v as Record<string, unknown>) : {}
        const username = normalizeUsername(String(item.author || ''))
        if (!username || seen.has(username)) continue
        seen.add(username)
        results.push({
          username,
          nickname: String(item.author_name || ''),
          followerCount: 0,
          avatar: String(item.avatar_thumb || ''),
        })
        if (results.length >= count) break
      }
      return results
    } catch (err) {
      console.warn(`[tiktok] ${provider.host} search failed:`, err instanceof Error ? err.message : err)
    }
  }

  console.warn('[tiktok] no search-capable provider available')
  return []
}
