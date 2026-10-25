import { useState } from 'react'
import { MARKET_CONFIG_FIELDS, MARKET_CONFIG_GROUPS, parseMarketConfigValue } from '../utils/marketConfigFields.js'
import { Field } from './MarketShared.jsx'
import { errorMessage, formatDateTime, numberOrEmpty } from '../utils/marketUi.js'

function initialForm(config) {
  return Object.fromEntries(Object.keys(MARKET_CONFIG_FIELDS).map((field) => [field, numberOrEmpty(config[field])]))
}

export default function MarketSettings({ api, config, onSaved }) {
  const [form, setForm] = useState(() => initialForm(config))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event) => {
    event.preventDefault()
    const payload = {}
    for (const [field, value] of Object.entries(form)) {
      const parsed = parseMarketConfigValue(field, value)
      if (parsed.error) {
        setError(parsed.error)
        return
      }
      payload[field] = parsed.value
    }
    setBusy(true)
    setError('')
    try {
      const saved = await api.put('/config', payload)
      setForm(initialForm(saved))
      onSaved(saved)
    } catch (requestError) {
      setError(errorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="market-panel" onSubmit={submit}>
      <div className="market-scroll">
        {MARKET_CONFIG_GROUPS.map((group) => (
          <section key={group.key} className="market-section">
            <h5>{group.label}</h5>
            <div className="market-form-grid">
              {Object.entries(MARKET_CONFIG_FIELDS).filter(([, spec]) => spec.group === group.key).map(([field, spec]) => (
                <Field key={field} label={spec.label} wide={spec.type === 'textarea'}
                  hint={spec.type === 'int' ? `${spec.min}–${spec.max}` : undefined}>
                  {spec.type === 'textarea' ? (
                    <textarea className="market-input" rows="7" maxLength={spec.maxLength} value={form[field]}
                      onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} />
                  ) : (
                    <input
                      className="market-input"
                      type={spec.type === 'time' ? 'time' : spec.type === 'text' ? 'text' : 'number'}
                      step={spec.type === 'money' ? '0.01' : undefined}
                      min={spec.type === 'int' ? spec.min : spec.type === 'money' ? 0 : undefined}
                      max={spec.type === 'int' ? spec.max : undefined}
                      maxLength={spec.maxLength}
                      value={form[field]}
                      onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))}
                    />
                  )}
                </Field>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="market-toolbar">
        {error && <p className="market-error">{error}</p>}
        {config.updated_at && <span className="market-muted">บันทึกล่าสุด {formatDateTime(config.updated_at)}</span>}
        <button type="submit" className="market-btn is-primary market-toolbar-end" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}</button>
      </div>
    </form>
  )
}
