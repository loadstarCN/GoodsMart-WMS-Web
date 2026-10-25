/**
 * 新密码规则（与后端 system/user/password_policy.py 一致，不合规后端 400 10015）：
 * 8–16 位；至少一个小写字母、一个大写字母、一个数字、一个特殊符号（@$!%*?&）；只能由英文字母、数字和这些符号组成。
 * 只管「设新密码」（修改密码、找回密码、新建 / 修改员工和平台用户），不影响已有密码登录。
 */
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 16
export const PASSWORD_SPECIAL_CHARACTERS = '@$!%*?&'
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[@$!%*?&])[A-Za-z0-9@$!%*?&]{8,16}$/

export const isValidPassword = (password: unknown): boolean =>
  typeof password === 'string' && PASSWORD_REGEX.test(password)

/** 不合规时的提示文案参数（common.validation.password-policy） */
export const passwordPolicyParams = () => ({
  min: PASSWORD_MIN_LENGTH,
  max: PASSWORD_MAX_LENGTH,
  special: PASSWORD_SPECIAL_CHARACTERS,
})

/** 生成符合规则的随机密码（加密安全的随机数；每类字符至少一个，再打乱顺序） */
export const generatePolicyPassword = (length = 12): string => {
  const size = Math.min(Math.max(length, PASSWORD_MIN_LENGTH), PASSWORD_MAX_LENGTH)
  const lower = 'abcdefghijkmnopqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const groups = [lower, upper, digits, PASSWORD_SPECIAL_CHARACTERS]
  const all = groups.join('')
  const random = new Uint32Array(size * 2)
  crypto.getRandomValues(random)
  const chars: string[] = []
  for (let i = 0; i < size; i++) {
    const pool = i < groups.length ? groups[i]! : all
    chars.push(pool[random[i]! % pool.length]!)
  }
  // Fisher–Yates 打乱（前几位固定是各类字符）
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random[size + i]! % (i + 1)
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }
  return chars.join('')
}
