import './DormInfoPanel.css'

function formatThaiTime(value) {
  if (!value) return ''
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return value
  return `${match[1].padStart(2, '0')}:${match[2]} น.`
}

function Contact({ label, phone }) {
  const dialablePhone = phone?.replace(/[^\d+]/g, '')

  return (
    <p>
      <span>{label}</span>
      {phone ? (
        <a href={`tel:${dialablePhone}`}>{phone}</a>
      ) : (
        <span>ยังไม่ได้ระบุ</span>
      )}
    </p>
  )
}

function DormInfoPanel({
  config,
  mode = 'published',
  onRefresh,
  refreshing = false,
  error = '',
}) {
  const isPreview = mode !== 'published'

  return (
    <section className="dorm-info-panel" aria-labelledby="dorm-info-title">
      <div className="dorm-info-header">
        <div>
          <p className="dorm-info-eyebrow">{config?.dorm_name || 'ข้อมูลหอพัก'}</p>
          <h2 id="dorm-info-title">กฎระเบียบและเบอร์ติดต่อ</h2>
        </div>
        {isPreview ? (
          <span className={`dorm-info-status is-${mode}`}>
            {mode === 'preview-draft' ? 'ตัวอย่างก่อนบันทึก' : 'ข้อมูลที่บันทึกแล้ว'}
          </span>
        ) : (
          <button type="button" className="dorm-info-refresh" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'กำลังอัปเดต...' : 'อัปเดตข้อมูลล่าสุด'}
          </button>
        )}
      </div>
      {isPreview && (
        <p className="dorm-info-note">
          {mode === 'preview-draft'
            ? 'ตัวอย่างนี้เปลี่ยนตามข้อมูลด้านบน ผู้เช่าจะเห็นหลังจากกดบันทึกสำเร็จ'
            : 'ข้อมูลนี้บันทึกแล้ว และแสดงให้ผู้เช่ากับเจ้าหน้าที่เห็น'}
        </p>
      )}
      {error && <p className="dorm-info-error" role="alert">{error}</p>}
      <div className="dorm-info-grid">
        <div className="dorm-info-item dorm-info-rules">
          <h3>กฎระเบียบหอพัก</h3>
          <p>{config?.dorm_rules?.trim() || 'ยังไม่ได้ระบุกฎระเบียบหอพัก'}</p>
        </div>
        <div className="dorm-info-item">
          <h3>เวลาปิดประตู</h3>
          <p className="dorm-info-value">{formatThaiTime(config?.gate_close_time) || 'ยังไม่ได้ระบุ'}</p>
        </div>
        <div className="dorm-info-item">
          <h3>เบอร์ติดต่อฉุกเฉิน</h3>
          <div className="dorm-info-contact-list">
            <Contact label="ผู้ดูแลหอพัก" phone={config?.caretaker_phone} />
            <Contact label="ช่าง" phone={config?.technician_phone} />
          </div>
        </div>
      </div>
    </section>
  )
}

export default DormInfoPanel
