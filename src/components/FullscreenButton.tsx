import { Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export function FullscreenButton({
  id = 'btn-toggle-fullscreen',
  compact = false,
}: {
  id?: string
  compact?: boolean
}) {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // Browser may block fullscreen in headless/sandboxed iframes
    }
  }

  return (
    <button
      id={id}
      type="button"
      data-ui-interactive="true"
      data-fullscreen={String(isFullscreen)}
      onClick={() => void toggleFullscreen()}
      title={isFullscreen ? 'ออกจากโหมดเต็มจอ (Exit Fullscreen)' : 'ขยายเต็มหน้าจอ (Fullscreen)'}
      className={
        compact
          ? 'pointer-events-auto inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-950/85 hover:bg-slate-800 border border-slate-700 text-emerald-300 cursor-pointer text-[10px] font-display uppercase'
          : 'px-3 py-2 bg-slate-900/85 hover:bg-slate-800 border border-slate-600/80 hover:border-cyan-400 text-slate-200 hud-cut-sm flex items-center gap-1.5 text-xs font-display tracking-wider uppercase transition cursor-pointer'
      }
    >
      {isFullscreen ? (
        <>
          <Minimize2 className={compact ? 'w-3 h-3' : 'w-4 h-4 text-amber-300'} />
          <span>{compact ? 'EXIT FS' : 'EXIT FULLSCREEN'}</span>
        </>
      ) : (
        <>
          <Maximize2 className={compact ? 'w-3 h-3' : 'w-4 h-4 text-emerald-300'} />
          <span>{compact ? 'FULLSCREEN' : 'FULLSCREEN'}</span>
        </>
      )}
    </button>
  )
}
