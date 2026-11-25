/**
 * dsh-tz-panel — the web half.
 *
 * Registered as a Settings section rather than a sidebar row: `settings.section`
 * is the slot the native settings shell renders for every feature page, so the
 * entry is reachable with no other plugin installed and no DS Bot team view.
 *
 * The host answers two operations on /api/tz-panel; everything visual here is
 * plain React elements, no build step and no JSX runtime.
 */
window.__ModuleLoader__.load({
  id: 'dsh-tz-panel',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')
    var h = react.createElement

    var ROUTE = '/api/tz-panel'

    function pad2(value) {
      return value < 10 ? '0' + value : String(value)
    }

    /** Wall clock at a fixed offset; the instant is shifted, never the machine. */
    function clockAt(instant, offsetMinutes) {
      var shifted = new Date(instant + offsetMinutes * 60000)
      return pad2(shifted.getUTCHours()) + ':' + pad2(shifted.getUTCMinutes()) + ':' + pad2(shifted.getUTCSeconds())
    }

    /** `480 -> UTC+8`, `-210 -> UTC-3:30`. */
    function offsetLabel(minutes) {
      if (typeof minutes !== 'number' || !isFinite(minutes)) return ''
      var sign = minutes < 0 ? '-' : '+'
      var absolute = Math.abs(minutes)
      var hours = Math.floor(absolute / 60)
      var rest = absolute % 60
      return 'UTC' + sign + hours + (rest === 0 ? '' : ':' + pad2(rest))
    }

    /**
     * Call the host route and decode its JSON.
     * @param method HTTP method.
     * @param body Optional JSON body.
     * @returns The decoded payload.
     */
    function request(method, body) {
      var init = { method: method, headers: { accept: 'application/json' } }
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(body)
      }
      return fetch(ROUTE, init).then(function (response) {
        return response.json().then(function (payload) {
          if (!response.ok) {
            var detail = payload && payload.error ? String(payload.error) : 'HTTP ' + response.status
            throw new Error(detail)
          }
          return payload
        })
      })
    }

    var label = 'var(--dsw-alias-label-primary)'
    var labelSoft = 'var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary))'
    var labelFaint = 'var(--dsw-alias-label-tertiary)'
    var border = 'var(--dsw-alias-border-l3,#0000001f)'
    var accent = 'var(--dsw-alias-state-business-primary,#2f6feb)'

    var styles = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '760px',
        color: label,
      },
      heading: { margin: 0, fontSize: '18px', fontWeight: 600 },
      intro: { margin: 0, fontSize: '13px', lineHeight: '20px', color: labelFaint },
      card: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        border: '1px solid ' + border,
        borderRadius: '12px',
        padding: '14px 16px',
      },
      cardTop: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' },
      cardLabel: { fontSize: '12px', letterSpacing: '0.02em', color: labelFaint },
      clock: {
        fontFamily: 'ui-monospace,Consolas,monospace',
        fontSize: '20px',
        fontVariantNumeric: 'tabular-nums',
        color: label,
      },
      cardZone: { fontSize: '15px', fontWeight: 600 },
      cardMeta: { fontSize: '12px', color: labelFaint, wordBreak: 'break-all' },
      search: {
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid ' + border,
        borderRadius: '10px',
        background: 'transparent',
        color: label,
        font: 'inherit',
        fontSize: '13px',
        padding: '8px 10px',
        outline: 'none',
      },
      list: {
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid ' + border,
        borderRadius: '12px',
        maxHeight: '420px',
        overflowY: 'auto',
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '9px 12px',
        borderTop: '1px solid ' + border,
      },
      rowFirst: { borderTop: 'none' },
      rowMain: { display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: '1 1 auto' },
      rowName: {
        fontSize: '13px',
        fontWeight: 500,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      rowId: { fontSize: '11px', color: labelFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      rowRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flex: '0 0 auto' },
      rowTime: {
        fontFamily: 'ui-monospace,Consolas,monospace',
        fontSize: '12px',
        fontVariantNumeric: 'tabular-nums',
        color: labelSoft,
      },
      rowOffset: { fontSize: '11px', color: labelFaint },
      button: {
        flex: '0 0 auto',
        font: 'inherit',
        fontSize: '12px',
        cursor: 'pointer',
        border: '1px solid ' + border,
        borderRadius: '8px',
        background: 'transparent',
        color: label,
        padding: '5px 12px',
        minWidth: '62px',
      },
      buttonActive: { borderColor: accent, color: accent },
      buttonBusy: { cursor: 'progress' },
      buttonCurrent: {
        flex: '0 0 auto',
        font: 'inherit',
        fontSize: '12px',
        border: '1px solid transparent',
        borderRadius: '8px',
        background: 'transparent',
        color: accent,
        padding: '5px 12px',
        minWidth: '62px',
        cursor: 'default',
      },
      notice: {
        border: '1px solid ' + border,
        borderRadius: '10px',
        padding: '8px 12px',
        fontSize: '12.5px',
        lineHeight: '18px',
        color: labelSoft,
      },
      noticeError: { borderColor: 'var(--dsw-alias-state-error-primary,#d03b3b)' },
      footer: { fontSize: '12px', color: labelFaint },
    }

    /** The Settings page: the live zone on top, every Windows zone below it. */
    function TzSection() {
      var statePair = react.useState({ phase: 'loading', zones: [], current: '', error: '' })
      var state = statePair[0]
      var setState = statePair[1]

      var queryPair = react.useState('')
      var query = queryPair[0]
      var setQuery = queryPair[1]

      var busyPair = react.useState('')
      var busy = busyPair[0]
      var setBusy = busyPair[1]

      var noticePair = react.useState(null)
      var notice = noticePair[0]
      var setNotice = noticePair[1]

      var nowPair = react.useState(function () {
        return Date.now()
      })
      var now = nowPair[0]
      var setNow = nowPair[1]

      var load = react.useCallback(function () {
        setState(function (previous) {
          return { phase: previous.zones.length > 0 ? 'ready' : 'loading', zones: previous.zones, current: previous.current, error: '' }
        })
        request('GET')
          .then(function (payload) {
            setState({
              phase: 'ready',
              zones: Array.isArray(payload.zones) ? payload.zones : [],
              current: typeof payload.current === 'string' ? payload.current : '',
              error: '',
            })
          })
          .catch(function (error) {
            setState({ phase: 'error', zones: [], current: '', error: String((error && error.message) || error) })
          })
      }, [])

      react.useEffect(function () {
        load()
      }, [load])

      react.useEffect(function () {
        var timer = setInterval(function () {
          setNow(Date.now())
        }, 1000)
        return function () {
          clearInterval(timer)
        }
      }, [])

      var switchTo = react.useCallback(function (id) {
        setBusy(id)
        setNotice(null)
        request('POST', { op: 'switch', id: id })
          .then(function (payload) {
            setBusy('')
            setState(function (previous) {
              return {
                phase: 'ready',
                zones: previous.zones,
                current: typeof payload.current === 'string' ? payload.current : previous.current,
                error: '',
              }
            })
            setNotice({ kind: 'ok', text: '已切换到 ' + id })
          })
          .catch(function (error) {
            setBusy('')
            setNotice({ kind: 'error', text: '切换失败：' + String((error && error.message) || error) })
          })
      }, [])

      var needle = query.trim().toLowerCase()
      var filtered = react.useMemo(function () {
        var zones = state.zones
        if (needle === '') return zones
        return zones.filter(function (zone) {
          var id = String(zone.id).toLowerCase()
          var name = String(zone.name).toLowerCase()
          return id.indexOf(needle) >= 0 || name.indexOf(needle) >= 0 || offsetLabel(zone.offset).toLowerCase().indexOf(needle) >= 0
        })
      }, [state.zones, needle])

      var currentZone = null
      for (var index = 0; index < state.zones.length; index += 1) {
        if (state.zones[index].id === state.current) {
          currentZone = state.zones[index]
          break
        }
      }
      var currentOffset = currentZone !== null ? currentZone.offset : -new Date().getTimezoneOffset()

      var children = [h('h2', { key: 'heading', style: styles.heading }, '时区')]

      children.push(
        h(
          'p',
          { key: 'intro', style: styles.intro },
          '切换 Windows 系统时区。每次切换会弹一次管理员确认（UAC），取消则不做任何改动。',
        ),
      )

      children.push(
        h(
          'div',
          { key: 'card', style: styles.card },
          h(
            'div',
            { style: styles.cardTop },
            h('span', { style: styles.cardLabel }, '当前时区'),
            h('span', { style: styles.clock }, clockAt(now, currentOffset)),
          ),
          h('div', { style: styles.cardZone }, currentZone !== null ? currentZone.name : state.current || '读取中…'),
          h(
            'div',
            { style: styles.cardMeta },
            (state.current || '—') + ' · ' + offsetLabel(currentOffset),
          ),
        ),
      )

      if (notice !== null) {
        children.push(
          h(
            'div',
            {
              key: 'notice',
              style: notice.kind === 'error' ? Object.assign({}, styles.notice, styles.noticeError) : styles.notice,
            },
            notice.text,
          ),
        )
      }

      if (state.phase === 'error') {
        children.push(
          h(
            'div',
            { key: 'error', style: Object.assign({}, styles.notice, styles.noticeError) },
            '读取时区列表失败：' + state.error,
          ),
          h(
            'div',
            { key: 'retry', style: { display: 'flex', gap: '8px' } },
            h(
              'button',
              { type: 'button', style: styles.button, onClick: load },
              '重试',
            ),
          ),
        )
        return h('div', { style: styles.page }, children)
      }

      children.push(
        h('input', {
          key: 'search',
          style: styles.search,
          type: 'search',
          value: query,
          placeholder: '搜索时区：名称、ID 或 UTC+8',
          onChange: function (event) {
            setQuery(event.target.value)
          },
        }),
      )

      var limit = 80
      var visible = filtered.slice(0, limit)
      var rows = visible.map(function (zone, rowIndex) {
        var isCurrent = zone.id === state.current
        var isBusy = busy === zone.id
        return h(
          'div',
          { key: zone.id, style: rowIndex === 0 ? Object.assign({}, styles.row, styles.rowFirst) : styles.row },
          h(
            'div',
            { style: styles.rowMain },
            h('div', { style: styles.rowName }, zone.name),
            h('div', { style: styles.rowId }, zone.id),
          ),
          h(
            'div',
            { style: styles.rowRight },
            h('div', { style: styles.rowTime }, clockAt(now, zone.offset)),
            h('div', { style: styles.rowOffset }, offsetLabel(zone.offset)),
          ),
          isCurrent
            ? h('button', { type: 'button', style: styles.buttonCurrent, disabled: true }, '当前')
            : h(
                'button',
                {
                  type: 'button',
                  style: Object.assign({}, styles.button, isBusy ? styles.buttonBusy : {}),
                  disabled: busy !== '',
                  onClick: function () {
                    switchTo(zone.id)
                  },
                },
                isBusy ? '切换中…' : '切换',
              ),
        )
      })

      children.push(h('div', { key: 'list', style: styles.list }, rows))

      if (filtered.length > visible.length) {
        children.push(
          h(
            'div',
            { key: 'more', style: styles.footer },
            '还有 ' + (filtered.length - visible.length) + ' 个匹配项，请继续输入以缩小范围。',
          ),
        )
      }

      children.push(
        h(
          'div',
          { key: 'footer', style: styles.footer },
          state.phase === 'loading' ? '正在读取 Windows 时区…' : '共 ' + state.zones.length + ' 个时区。',
        ),
      )

      return h('div', { style: styles.page }, children)
    }

    /**
     * Register the page as one Settings section. `settings.section` is the slot
     * the native settings shell lists in its nav, so this needs no other plugin.
     * @param ctx The client plugin context.
     */
    function apply(ctx) {
      ctx.slots.inject('settings.section', function () {
        return ctx.slots.register(
          {
            name: 'settings.section',
            id: 'tz-panel',
            order: 40,
            label: function () {
              return '时区'
            },
          },
          TzSection,
        )
      })
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
