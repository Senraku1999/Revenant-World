// ── 正则常量（避免运行时重编译）──

/** CJK 统一表意文字 U+4E00–U+9FFF */
export const CJK_CHAR = /[一-鿿]/;

/** 中文句末英文句号 */
export const CHINESE_PERIOD_END = /[一-鿿]\.[\s]*$/;

/** 英文逗号分隔中文 */
export const ENGLISH_COMMA_ZH = /[一-鿿],[一-鿿]/;

/** 英文分号分隔中文 */
export const ENGLISH_SEMICOLON_ZH = /[一-鿿];[一-鿿]/;

/** 英文冒号分隔中文 */
export const ENGLISH_COLON_ZH = /[一-鿿]:[一-鿿]/;

/** 叹号叠用超过三个 */
export const EXCLAM_EXCESS = /！{4,}/;

/** 问号叠用超过三个 */
export const QUESTION_EXCESS = /？{4,}/;

/** 中文省略号 ... */
export const ELLIPSIS_DOTS = /[一-鿿]\.\.\.[一-鿿]|[一-鿿]\.\.\.[\s]*$/;

/** 中文文本中两个句点 */
export const DOUBLE_DOT = /(?<!\.)\.\.(?!\.)/;

/** 单个 em dash */
export const SINGLE_EM_DASH = /(?<!—)—(?!—)/;

/** em dash 中间带空格 */
export const EM_DASH_SPACED = /—\s+—/;

/** 省略号中间带空格 */
export const ELLIPSIS_SPACED = /…\s+…/;

/** 行首标点 */
export const PUNCT_START_OF_LINE = /^\s*[，、；：。？！]/;

/** 行末前引号/括号 */
export const QUOTE_END_OF_LINE = /[“（《【]\s*$/;

/** 间隔号误用 bullet */
export const BULLET_AS_INTERPUNCT = /[一-鿿]•[一-鿿]/;

/** 逗号 (global) */
export const COMMA_G = /，/g;

/** 句号 (global) */
export const PERIOD_G = /。/g;

/** 分号 (global) */
export const SEMICOLON_G = /；/g;

/** 冒号 (global) */
export const COLON_G = /：/g;

/** 叹号/问号 (global) */
export const EXCLAM_QUESTION_G = /[！？]/g;

/** MD 简介模板标签 */
export const MD_TEMPLATE_LABELS = /^(姓名|一般称呼|性别|年龄|身高|体重|从属|身份|评级|特征|灵力|灵视|身体素质|评估方|武器|防具|[一二三四五六七八九十]、\S+)：/;

/** 后句显式主语 */
export const SUBJECT_STARTERS = /^(他|她|它|他们|她们|我|你|您|这|那|其|该|此|这些|那些)/;

/** 后句无显式主语（连续动作） */
export const CONSECUTIVE_VERB = /^[一-鿿]+(了|着|过|得|不|在|可|能|会|要|想|敢)/;

/** 去除引号内容 */
export const QUOTE_STRIP = /"[\s\S]*?"/g;

/** 非言语动词 — 冒号接引号检测 */
export const NON_SPEECH_COLON_QUOTE = /([一-鿿]{1,6})："/;

/** 连续连词开头 */
export const CONSECUTIVE_CONJ = /^(于是|所以|因此|从而|进而|随后|接着|然后|便|就|也|还|都|却|仍)/;

/** 转折/递进连词 */
export const TRANSITION_CONJ = /^(但|而|然而|可是|不过|况且|并且|而且|然后|于是|所以|因此|因为|可|却)/;

/** 身份标签结尾 */
export const IDENTITY_ENDING = /(者|家|师|长|员|人|生|手|专家|科长|成员)$/;

/** 时间/地点状语结尾 */
export const ADVERBIAL_ENDING = /(时|的时候|后|之后|前|之前|中|期间|以来|以后|以前)$/;

/** 并列动词（了/着/过结尾） */
export const PARALLEL_VERB = /[了着过]$/;

/** 并列动词开头 */
export const PARALLEL_VERB_START = /^[一-鿿]+[了着过]/;

/** 平行对举格式 */
export const PARALLEL_PAIR = /^[一-鿿]+[：:]/;

/** 身高/体重数字格式 */
export const HEIGHT_WEIGHT_FORMAT = /^\d+\s*(cm|kg|m)$/;

/** 身高体重字段 */
export const HEIGHT_WEIGHT_FIELDS = /(身高|体重|height|weight)/;
