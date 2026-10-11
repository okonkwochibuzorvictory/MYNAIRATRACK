import { useCallback, useEffect, useState } from 'react'

/** Minimal typing for the Chromium install prompt event. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia?.('(display-mode: standalone)')
  if (mq?.matches) return true
  // iOS Safari
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (typeof nav.standalone === 'boolean' && nav.standalone) return true
  return false
}

function isiOS(): boolean {
  if (typeof window === 'undefined') return false
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isAndroid(): boolean {
  if (typeof window === 'undefined') return false
  return /android/i.test(window.navigator.userAgent)
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState<boolean>(() => isStandalone())
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('mt-install-dismissed') === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const dismiss = useCallback(() => {
    setDismissed(true)
    try {
      window.localStorage.setItem('mt-install-dismissed', '1')
    } catch {
      /* ignore */
    }
  }, [])

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'manual'> => {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'accepted') {
        setDeferred(null)
        setInstalled(true)
      }
      return choice.outcome
    }
    // No programmatic prompt available (Firefox, iOS Safari, already-installed
    // Chrome, etc.) — caller should show manual instructions.
    return 'manual'
  }, [deferred])

  const canPrompt = deferred !== null && !installed
  const showManualHint = !installed && !dismissed && !deferred
  const showBanner = !installed && !dismissed && (canPrompt || showManualHint)

  return {
    installed,
    canPrompt,
    showBanner,
    showManualHint,
    dismissed,
    isIOS: isiOS(),
    isAndroid: isAndroid(),
    install,
    dismiss,
  }
}

function manualSteps(isIOS: boolean, isAndroid: boolean): string {
  if (isIOS) return 'Tap Share, then “Add to Home Screen”.'
  if (isAndroid) return 'Tap the browser menu (⋮), then “Add to Home screen” or “Install app”.'
  return 'Use your browser menu → “Install MYNAIRATRACK” or “Add to Home screen”.'
}

/** Compact "Install app" button for headers / hero sections. Always visible unless installed. */
export function InstallButton({ variant = 'gold' }: { variant?: 'gold' | 'outline' | 'secondary' }) {
  const { installed, install, isIOS, isAndroid } = useInstallPrompt()
  const [note, setNote] = useState<string | null>(null)

  if (installed) return null

  const cls =
    variant === 'gold'
      ? 'mt-btn mt-btn-gold mt-install-btn'
      : variant === 'outline'
        ? 'mt-btn mt-install-btn mt-install-outline'
        : 'mt-btn mt-btn-secondary mt-install-btn'

  async function onClick() {
    const outcome = await install()
    if (outcome === 'manual') {
      setNote(manualSteps(isIOS, isAndroid))
      window.setTimeout(() => setNote(null), 6000)
    } else if (outcome === 'dismissed') {
      setNote(manualSteps(isIOS, isAndroid))
      window.setTimeout(() => setNote(null), 6000)
    }
  }

  return (
    <span className="mt-install-wrap">
      <button type="button" className={cls} onClick={onClick} aria-label="Install MYNAIRATRACK app">
        <span aria-hidden="true">⬇</span> Install app
      </button>
      {note && (
        <span className="mt-install-note" role="status">
          {note}
        </span>
      )}
    </span>
  )
}

/** Dismissible banner that appears at the bottom on every page until installed/dismissed. */
export function InstallBanner() {
  const { showBanner, canPrompt, install, dismiss, isIOS, isAndroid } = useInstallPrompt()
  const [note, setNote] = useState<string | null>(null)

  if (!showBanner) return null

  async function onInstall() {
    const outcome = await install()
    if (outcome === 'manual' || outcome === 'dismissed') {
      setNote(manualSteps(isIOS, isAndroid))
    }
  }

  return (
    <div className="mt-install-banner" role="region" aria-label="Install MYNAIRATRACK">
      <span className="mt-install-mark" aria-hidden="true">
        ₦
      </span>
      <div className="mt-install-text">
        <strong>Install MYNAIRATRACK</strong>
        <small>{note ?? 'Add it to your home screen for quick, offline-ready access.'}</small>
      </div>
      {canPrompt ? (
        <button type="button" className="mt-btn mt-btn-gold mt-install-cta" onClick={onInstall}>
          Install
        </button>
      ) : (
        <button type="button" className="mt-btn mt-btn-gold mt-install-cta" onClick={onInstall}>
          How to install
        </button>
      )}
      <button type="button" className="mt-install-close" onClick={dismiss} aria-label="Dismiss install prompt">
        ✕
      </button>
    </div>
  )
}
