import { useState } from 'react'
import { Button, Dialog } from '../ui/primitives'
import { Icon } from '../ui/Icon'
import { pwaRuntime } from './pwa-runtime'
import { usePwaSnapshot } from './use-pwa'
import './pwa-notices.css'

export function PwaNotices({ showInstall }: { showInstall: boolean }) {
  const snapshot = usePwaSnapshot()
  const [showIosGuide, setShowIosGuide] = useState(false)

  return (
    <>
      {snapshot.updateAvailable ? (
        <section className="pwa-notice pwa-notice--update" role="status">
          <div className="pwa-notice__copy">
            <Icon name="refresh" size={18} />
            <div>
              <strong>Forge 已有新版本</strong>
              <span>{snapshot.updateError ? '更新暂时无法激活，请重试。' : '确认后将刷新应用；未确认前可继续使用当前版本。'}</span>
            </div>
          </div>
          <div className="pwa-notice__actions">
            <Button disabled={snapshot.activatingUpdate} onClick={() => pwaRuntime.deferUpdate()} variant="ghost">稍后</Button>
            <Button disabled={snapshot.activatingUpdate} leadingIcon="refresh" onClick={() => void pwaRuntime.activateUpdate()}>
              {snapshot.activatingUpdate ? '正在更新' : '立即更新'}
            </Button>
          </div>
        </section>
      ) : null}

      {showInstall && snapshot.installation === 'installable' ? (
        <section className="pwa-notice pwa-notice--install" role="status">
          <div className="pwa-notice__copy">
            <Icon name="plus" size={18} />
            <div><strong>安装 Forge</strong><span>添加到设备，离线也能快速打开。</span></div>
          </div>
          <Button onClick={() => void pwaRuntime.promptInstall()} variant="secondary">安装</Button>
        </section>
      ) : null}

      {showInstall && snapshot.installation === 'ios-manual' ? (
        <section className="pwa-notice pwa-notice--install" role="status">
          <div className="pwa-notice__copy">
            <Icon name="plus" size={18} />
            <div><strong>添加 Forge 到主屏幕</strong><span>iPhone 与 iPad 需要手动安装。</span></div>
          </div>
          <Button onClick={() => setShowIosGuide(true)} variant="secondary">查看方法</Button>
        </section>
      ) : null}

      {showInstall && snapshot.offlineReady ? (
        <section className="pwa-notice pwa-notice--ready" role="status">
          <div className="pwa-notice__copy">
            <Icon name="check" size={18} />
            <div><strong>离线内容已就绪</strong><span>无网络时仍可启动 Forge 并读取本地训练数据。</span></div>
          </div>
          <Button onClick={() => pwaRuntime.dismissOfflineReady()} variant="ghost">知道了</Button>
        </section>
      ) : null}

      <Dialog
        actions={<Button fullWidth onClick={() => setShowIosGuide(false)}>知道了</Button>}
        className="pwa-install-sheet"
        onClose={() => setShowIosGuide(false)}
        open={showIosGuide}
        title="在 iOS 安装 Forge"
      >
        <ol className="pwa-ios-guide">
          <li>使用 Safari 打开当前页面。</li>
          <li>点按浏览器工具栏中的“分享”。</li>
          <li>选择“添加到主屏幕”，再点按“添加”。</li>
        </ol>
      </Dialog>
    </>
  )
}
