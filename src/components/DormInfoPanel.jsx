import './DormInfoPanel.css'

function Contact({ label, phone }) {
  const dialablePhone = phone?.replace(/[^\d+]/g, '')

  return (
    <p>
      <span>{label}</span>
      {phone ? <a href={`tel:${dialablePhone}`}>{phone}</a> : <span>ยังไม่ได้ระบุ</span>}
    </p>
  )
}

function DormInfoPanel({ config, mode = 'published' }) {
  const isPreview = mode !== 'published'

  return (
    <section className="dorm-info-panel" aria-labelledby="dorm-info-title">
      <div className="dorm-info-header">
        <div>
          <p className="dorm-info-eyebrow">{config?.dorm_name || 'หอพัก'}</p>
          <h2 id="dorm-info-title">กฎระเบียบและเบอร์ติดต่อ</h2>
        </div>
        {isPreview && (
          <span className={`dorm-info-status is-${mode}`}>
            {mode === 'preview-draft' ? 'ตัวอย่างก่อนบันทึก' : 'ข้อมูลที่บันทึกแล้ว'}
          </span>
        )}
      </div>
      {isPreview && (
        <p className="dorm-info-note">
          {mode === 'preview-draft'
            ? 'ตัวอย่างนี้เปลี่ยนตามข้อมูลด้านบน ผู้เช่าจะเห็นหลังจากกดบันทึกสำเร็จ'
            : 'ข้อมูลนี้บันทึกแล้ว และแสดงให้ผู้เช่ากับเจ้าหน้าที่เห็น'}
        </p>
      )}
      <div className="dorm-info-grid">
        <div className="dorm-info-item dorm-info-rules">
          <h3>กฎระเบียบหอพัก</h3>
          <p>{config?.dorm_rules?.trim() || 'ยังไม่ได้ระบุกฎระเบียบหอพัก'}</p>
        </div>
        <div className="dorm-info-item">
          <h3>เบอร์ติดต่อฉุกเฉิน</h3>
          <div className="dorm-info-contact-list">
            <Contact label="ผู้ดูแลหอพัก" phone={config?.caretaker_phone} />
          </div>
        </div>
      </div>
    </section>
  )
}

export default DormInfoPanel
