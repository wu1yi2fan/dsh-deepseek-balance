window.__ModuleLoader__.load({
  id: '@local/dsh-deepseek-balance',
  factory(require) {
    const React = require('react');
    const createPortal = require('react-dom').createPortal;

    const NS = '@local/dsh-deepseek-balance';
    const SLOT = 'conversation.composer.dock';
    const ENDPOINT = '/api/deepseek-balance';
    const REFRESH_MS = 300_000;
    /**
     * Wait after a conversation settles before asking. The status event fires the
     * moment the Session stops being busy, and a bare instant later the Host has
     * finished closing the turn; the delay also collapses several sessions
     * settling together into one query.
     */
    const CONVERSATION_END_DELAY_MS = 400;
    /** Viewport margin the popover placement keeps. */
    const PANEL_MARGIN = 12;
    /** Distance between the trigger's top edge and the popover's bottom. */
    const PANEL_GAP = 8;
    /** Unplaced portal panel: hidden but laid out, so the clamp measures it. */
    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

    const STYLES = [
      // Pill: every metric is the composer dock stats pills' own — the same
      // `--dsh-content-font-size-secondary - 1px` type size at the secondary 20px
      // line box, tabular figures, 1px/8px box, 6px icon gap, and the same
      // middle-dot separator — so three entries in the dock read as one row.
      '.dshBalancePill{box-sizing:border-box;corner-shape:round;max-width:100%;color:var(--dsw-alias-label-tertiary);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);font-variant-numeric:tabular-nums;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;background:0 0;border:none;border-radius:999px;flex:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}',
      'button.dshBalancePill{cursor:pointer}',
      'button.dshBalancePill:hover,button.dshBalancePill:focus-visible,button.dshBalancePill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
      'button.dshBalancePill:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dshBalancePill svg{flex:none;width:16px;height:16px}',
      '.dshBalancePill .dshBalanceLabel{text-overflow:ellipsis;min-width:0;overflow:hidden}',
      '.dshBalancePill .dshBalanceSep{color:var(--dsw-alias-separator-primary);margin:0 6px}',
      '.dshBalancePill .dshBalanceValue{font-variant-numeric:tabular-nums}',
      '.dshBalancePill .dshBalanceIcon{fill:none;stroke:currentColor;stroke-width:1;stroke-linecap:round;stroke-linejoin:round}',
      '.dshBalancePill.dshBalanceWarn{color:var(--dsw-alias-state-error-primary)}',
      // Popover: the shipped Token-usage dialog's own panel design, so the two
      // readings open the same way and read as one family.
      '.dshBalancePanel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}',
      '.dshBalancePanel .dshBalanceTitle{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}',
      '.dshBalancePanel .dshBalanceTitleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}',
      '.dshBalancePanel .dshBalanceTitleLabel svg{flex:none;width:14px;height:14px}',
      '.dshBalancePanel .dshBalanceTitleValue{font-variant-numeric:tabular-nums}',
      '.dshBalancePanel .dshBalanceTitleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}',
      '.dshBalancePanel .dshBalanceDetails{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}',
      '.dshBalancePanel .dshBalanceDetails dt,.dshBalancePanel .dshBalanceDetails dd{min-width:0;margin:0}',
      '.dshBalancePanel .dshBalanceDetails dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}',
      '.dshBalancePanel .dshBalanceNote{overflow-wrap:anywhere}',
      '.dshBalancePanel .dshBalanceNote,.dshBalancePanel .dshBalanceError{color:var(--dsw-alias-label-tertiary);margin:0}',
      '.dshBalancePanel .dshBalanceError{color:var(--dsw-alias-state-error-primary)}',
    ].join('');

    /** Wallet symbol for the currencies the endpoint reports. */
    function symbolOf(currency) {
      return currency === 'CNY' ? '\u00a5' : currency === 'USD' ? '$' : `${currency} `;
    }

    /**
     * Two decimals, matching the platform's money display.
     * @param amount - decimal string from the API.
     * @returns the display amount.
     */
    function formatAmount(amount) {
      const value = Number(amount);
      return Number.isFinite(value) ? value.toFixed(2) : amount;
    }

    function formatWallet(wallet) {
      return `${symbolOf(wallet.currency)}${formatAmount(wallet.totalBalance)}`;
    }

    /**
     * Read the balance the Host half serves for this session.
     * @param refresh - ask the Host to bypass its cache.
     * @returns one published balance state.
     */
    async function readBalance(refresh) {
      let response;
      try {
        response = await fetch(`${ENDPOINT}?refresh=${refresh ? '1' : '0'}`, {
          headers: { accept: 'application/json' },
          credentials: 'same-origin',
        });
      } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) };
      }
      if (!response.ok) return { status: 'error', message: `${ENDPOINT} answered HTTP ${response.status}` };
      try {
        return await response.json();
      } catch (error) {
        return { status: 'error', message: error instanceof Error ? error.message : String(error) };
      }
    }

    /**
     * Wallet drawn to the same recipe as the neighbouring dock icons: a 14-unit
     * box, no fill, one 1px round-capped stroke in `currentColor`, so the pill
     * inherits the row's colour and hover states by itself. The four paths are
     * the back flap, the body, the card-slot plate, and the card's rivet.
     * @returns the icon element.
     */
    function BalanceIcon() {
      return React.createElement('svg', {
        viewBox: '0 0 15 17',
        width: 16,
        height: 16,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        focusable: false,
      },
      React.createElement('path', { className: 'dshBalanceIcon', d: 'M1.5 5.1A1.6 1.6 0 0 1 3.1 3.5H9.7A1.6 1.6 0 0 1 11.3 5.1V5.6' }),
      React.createElement('path', { className: 'dshBalanceIcon', d: 'M1.5 5.1A1.6 1.6 0 0 0 -0.1 6.7V11.9A1.6 1.6 0 0 0 1.5 13.5H12.5A1.6 1.6 0 0 0 14.1 11.9V10.9' }),
      React.createElement('path', { className: 'dshBalanceIcon', d: 'M14.1 6H7.1A1.4 1.4 0 0 0 5.7 7.4V8.6A1.4 1.4 0 0 0 7.1 10H14.1A0.5 0.5 0 0 0 14.6 9.5V6.5A0.5 0.5 0 0 0 14.1 6Z' }),
      React.createElement('path', { className: 'dshBalanceIcon', d: 'M9.7 8H11.5' }));
    }

    /**
     * Place the portaled panel above its trigger, clamped into the viewport the
     * way the shipped stat dialog does it: measure first, then keep the result
     * true across scrolls, resizes, and the panel's own size changes.
     * @param open - whether the panel is mounted.
     * @param anchorRef - the trigger element.
     * @param panelRef - the portaled panel element.
     * @returns the placement, or null while the panel still has to be measured.
     */
    function useAnchoredPosition(open, anchorRef, panelRef) {
      const state = React.useState(null);
      const position = state[0];
      const setPosition = state[1];

      React.useLayoutEffect(() => {
        if (!open) {
          setPosition(null);
          return undefined;
        }
        const place = () => {
          const anchor = anchorRef.current;
          const panel = panelRef.current;
          if (anchor === null || panel === null) return;
          const rect = anchor.getBoundingClientRect();
          const width = panel.offsetWidth;
          const height = panel.offsetHeight;
          if (width === 0 && height === 0) return;
          let left = rect.left;
          let top = rect.top - PANEL_GAP - height;
          if (width > 0) left = Math.min(Math.max(left, PANEL_MARGIN), window.innerWidth - width - PANEL_MARGIN);
          if (height > 0) top = Math.min(Math.max(top, PANEL_MARGIN), window.innerHeight - height - PANEL_MARGIN);
          setPosition({ left, top });
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        let observer = null;
        if (typeof ResizeObserver !== 'undefined' && panelRef.current !== null) {
          observer = new ResizeObserver(place);
          observer.observe(panelRef.current);
        }
        return () => {
          observer?.disconnect();
          window.removeEventListener('scroll', place, true);
          window.removeEventListener('resize', place);
        };
      }, [open, anchorRef, panelRef]);

      return position;
    }

    /**
     * Outside-pointer and Escape dismissal for one trigger/panel pair.
     * @param open - whether the panel is mounted.
     * @param rootRef - the trigger's seat.
     * @param panelRef - the portaled panel.
     * @param close - close callback.
     */
    function useDismiss(open, rootRef, panelRef, close) {
      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          const target = event.target;
          if (rootRef.current?.contains(target) === true) return;
          if (panelRef.current?.contains(target) === true) return;
          close();
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') close();
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [open, rootRef, panelRef, close]);
    }

    /**
     * @param props - detail rows to render in the panel's definition grid.
     * @returns the grid.
     */
    function BalanceDetails(props) {
      return React.createElement('dl', { className: 'dshBalanceDetails' },
        props.rows.flatMap((row) => [
          React.createElement('dt', { key: `${row.key}-t` }, row.label),
          React.createElement('dd', { key: `${row.key}-d` }, row.value),
        ]));
    }

    /**
     * Compact balance reading beside the composer's token-usage stats; opening it
     * refreshes the reading once and shows the breakdown in a panel shaped like
     * the Token-usage dialog.
     * @param props - slot props; `t` is bound to this plugin's locale namespace.
     * @returns the pill, or null until the Host route has answered.
     */
    function BalancePill(props) {
      const t = props.t;
      const state = React.useState({ phase: 'loading' });
      const read = state[0];
      const setRead = state[1];
      const openState = React.useState(false);
      const open = openState[0];
      const setOpen = openState[1];
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const inFlight = React.useRef(false);

      const load = React.useCallback((refresh) => {
        let live = true;
        if (inFlight.current) return () => {};
        inFlight.current = true;
        readBalance(refresh).then((value) => {
          inFlight.current = false;
          if (live) setRead({ phase: 'settled', value });
          return undefined;
        }, () => {
          inFlight.current = false;
        });
        return () => {
          live = false;
        };
      }, []);

      const close = React.useCallback(() => {
        setOpen(false);
      }, []);

      const position = useAnchoredPosition(open, rootRef, panelRef);
      useDismiss(open, rootRef, panelRef, close);

      React.useEffect(() => {
        const cancel = load(false);
        const timer = setInterval(() => {
          if (document.visibilityState === 'visible') load(false);
        }, REFRESH_MS);
        const onVisible = () => {
          if (document.visibilityState === 'visible') load(false);
        };
        document.addEventListener('visibilitychange', onVisible);
        // Every finished conversation asks once: the Host announces a Session's
        // busy flag, and the running→idle edge is a turn's settlement. The
        // balance is account-wide, so any Session's turn counts. Failure to
        // subscribe (a composition without the Remote gateway) only costs this
        // trigger — the timer and click paths stay.
        let endTimer;
        let unsubscribe;
        try {
          unsubscribe = ctx.remote.$on('api-session/status', (sessionId, running) => {
            if (running || running === undefined) return;
            clearTimeout(endTimer);
            endTimer = setTimeout(() => {
              load(false);
            }, CONVERSATION_END_DELAY_MS);
          });
        } catch (error) {
          console.error('[deepseek-balance] conversation-end refresh is unavailable:', error);
        }
        return () => {
          cancel();
          clearInterval(timer);
          clearTimeout(endTimer);
          document.removeEventListener('visibilitychange', onVisible);
          unsubscribe?.();
        };
      }, [load]);

      if (read.phase === 'loading') return null;
      const value = read.value;
      if (value === null || typeof value !== 'object') return null;
      if (value.status === 'ready' && !Array.isArray(value.wallets)) return null;

      const ready = value.status === 'ready';
      const wallets = ready ? value.wallets : [];
      const reading = ready
        ? (wallets.length > 0 ? wallets.map(formatWallet).join(' / ') : t('balance.zero'))
        : value.status === 'unconfigured'
          ? t('balance.unconfigured')
          : value.status === 'unauthorized'
            ? t('balance.unauthorized')
            : t('balance.unavailable');

      const labelKey = ready
        ? 'balance.title'
        : value.status === 'unconfigured'
          ? 'balance.unconfigured'
          : value.status === 'unauthorized'
            ? 'balance.unauthorized'
            : 'balance.unavailable';

      const rows = ready
        ? wallets.flatMap((wallet, index) => [
            {
              key: `${wallet.currency}-total`,
              label: wallets.length > 1 ? t('balance.totalOf', { currency: wallet.currency }) : t('balance.total'),
              value: `${symbolOf(wallet.currency)}${formatAmount(wallet.totalBalance)}`,
            },
            {
              key: `${wallet.currency}-granted`,
              label: t('balance.granted'),
              value: wallet.grantedBalance === null ? '-' : `${symbolOf(wallet.currency)}${formatAmount(wallet.grantedBalance)}`,
            },
            {
              key: `${wallet.currency}-topped`,
              label: t('balance.toppedUp'),
              value: wallet.toppedUpBalance === null ? '-' : `${symbolOf(wallet.currency)}${formatAmount(wallet.toppedUpBalance)}`,
            },
            ...(index === 0
              ? [
                  { key: 'available', label: t('balance.usable'), value: value.available ? t('balance.yes') : t('balance.no') },
                  { key: 'source', label: t('balance.sourceLabel'), value: value.source ?? '-' },
                ]
              : []),
          ])
        : [];

      const panel = open && createPortal(React.createElement('div', {
        ref: panelRef,
        className: 'dshBalancePanel',
        style: position ?? MEASURE_STYLE,
        role: 'dialog',
        'aria-label': t('balance.title'),
      },
      React.createElement('div', { className: 'dshBalanceTitle' },
        React.createElement('span', { className: 'dshBalanceTitleLabel' },
          React.createElement(BalanceIcon, null),
          t('balance.title')),
        React.createElement('span', { className: 'dshBalanceTitleValue' }, reading)),
      React.createElement('div', { className: 'dshBalanceTitleRule', 'aria-hidden': true }),
      ready
        ? React.createElement(BalanceDetails, { rows })
        : React.createElement('p', { className: 'dshBalanceNote dshBalanceError' }, `${t(labelKey)}${value.message ? `\n${value.message}` : ''}`)),
      document.body);

      return React.createElement('span', { ref: rootRef, style: { display: 'inline-flex', flex: 'none' } },
        React.createElement('button', {
          type: 'button',
          className: `dshBalancePill${ready ? '' : ' dshBalanceWarn'}`,
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          'aria-label': `${t('balance.title')}: ${reading}`,
          onClick: () => {
            const next = !open;
            setOpen(next);
            if (next) load(true);
          },
        }, React.createElement(BalanceIcon, null), React.createElement('span', { className: 'dshBalanceLabel' },
          t(labelKey),
          React.createElement('span', { className: 'dshBalanceSep', 'aria-hidden': true }, '\u00b7'),
          React.createElement('span', { className: 'dshBalanceValue' }, reading))),
        panel);
    }

    const NAMESPACE_DICTS = {
      en: {
        'balance.title': 'Balance',
        'balance.total': 'Total available',
        'balance.totalOf': 'Total available ({currency})',
        'balance.granted': 'Granted',
        'balance.toppedUp': 'Topped up',
        'balance.usable': 'Usable for API calls',
        'balance.sourceLabel': 'Credential',
        'balance.yes': 'yes',
        'balance.no': 'no',
        'balance.zero': 'Balance 0',
        'balance.unconfigured': 'No API key is configured.',
        'balance.unauthorized': 'The API key was rejected.',
        'balance.unavailable': 'The balance is unavailable.',
      },
      zh: {
        'balance.title': '余额',
        'balance.total': '总可用余额',
        'balance.totalOf': '总可用余额（{currency}）',
        'balance.granted': '赠金余额',
        'balance.toppedUp': '充值余额',
        'balance.usable': '可用于 API 调用',
        'balance.sourceLabel': '凭据来源',
        'balance.yes': '是',
        'balance.no': '否',
        'balance.zero': '余额 0',
        'balance.unconfigured': '未配置 API Key。',
        'balance.unauthorized': 'API Key 被拒绝。',
        'balance.unavailable': '余额当前不可用。',
      },
    };

    return {
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, NAMESPACE_DICTS), 'deepseek-balance: locale');
        ctx.effect(() => ctx.slots.inject(SLOT, () => ctx.slots.register({
          name: SLOT,
          id: 'deepseek-balance',
          order: 200,
          label: 'Account balance',
          locale: NS,
        }, BalancePill)), 'deepseek-balance: slot entry');
        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.dshPlugin = '@local/dsh-deepseek-balance';
          style.textContent = STYLES;
          document.head.appendChild(style);
          return () => {
            style.remove();
          };
        }, 'deepseek-balance: styles');
      },
    };
  },
});
