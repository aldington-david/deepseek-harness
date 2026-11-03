/** Host-operation messages shown by the original Web frame. */
export const zh = {
  invalidLink: '无法打开这个链接；仅支持不含登录凭据的 HTTP 或 HTTPS 地址。',
  invalidFile: '导出文件无效；请重新打开页面后再试。',
  unavailable: '宿主连接尚未就绪，请重新打开工作台。',
  timeout: '宿主未能及时完成操作，请确认是否已打开或下载后再重试。',
  closed: '工作台页面已关闭，操作结果未确认。',
}
/** English messages for the same host-operation outcomes. */
export const en: Record<keyof typeof zh, string> = {
  invalidLink: 'Cannot open this link. Use an HTTP or HTTPS address without login credentials.',
  invalidFile: 'The export file is invalid. Reopen the page and try again.',
  unavailable: 'The host connection is not ready. Reopen the workbench.',
  timeout: 'The host operation timed out. Check whether it already opened or downloaded before retrying.',
  closed: 'The workbench closed before the operation was confirmed.',
}
