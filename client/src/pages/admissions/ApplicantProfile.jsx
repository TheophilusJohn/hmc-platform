import { useState, useEffect } from 'react';
import { Badge, Btn, Tabs, Modal } from '../../components/common';
import api from '../../utils/api';

const STAGES = ['RECEIVED','DOCS_REVIEW','INTERVIEW_SCHEDULED','INTERVIEW_DONE','WAITLISTED','ACCEPTED','ENROLLED'];
const STAGE_LABELS = { RECEIVED:'Received', DOCS_REVIEW:'Docs Review', INTERVIEW_SCHEDULED:'Interview Scheduled', INTERVIEW_DONE:'Interview Done', WAITLISTED:'Waitlisted', ACCEPTED:'Accepted', ENROLLED:'Enrolled', REJECTED:'Rejected' };

// Humanize a camelCase or snake_case docType into a display label:
//   'birthCertificate'    → 'Birth Certificate'
//   'characterReference1' → 'Character Reference 1'
//   'id_proof'            → 'Id Proof'   (legacy admin-uploaded fallback)
function humanizeDocType(key) {
  if (!key) return 'Document';
  return String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : w)
    .join(' ');
}

function formatBytes(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function valueOrDash(v) {
  if (v == null) return '—';
  const s = String(v).trim();
  return s === '' ? '—' : s;
}

function yesNoOrDash(v) {
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return '—';
}

export default function ApplicantProfile({ applicant: initial, onClose, onUpdate }) {
  const [applicant, setApplicant] = useState(initial);
  const [tab, setTab] = useState('personal');
  const [interviewNotes, setInterviewNotes] = useState(applicant.interviewNotes || '');
  const [interviewScore, setInterviewScore] = useState(applicant.interviewScore || '');
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    const { data } = await api.get(`/admissions/${applicant.id}`);
    setApplicant(data.applicant || data);
  };

  // Fetch the full applicant (with documents + references) on open. The
  // list endpoint returns only the flat row, so the Documents tab would show
  // every doc as "Missing" until something else triggered a refresh.
  useEffect(() => {
    refresh().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = async () => {
    setLoading(true);
    try {
      const nextStage = STAGES[STAGES.indexOf(applicant.pipelineStage) + 1];
      if (!nextStage) return;
      await api.put(`/admissions/${applicant.id}/stage`, { stage: nextStage });
      onUpdate();
    } catch (e) { alert(e.response?.data?.message || 'Cannot advance: prerequisites not met.'); }
    finally { setLoading(false); }
  };

  const accept = async () => {
    setLoading(true);
    try { await api.post(`/admissions/${applicant.id}/accept`); onUpdate(); }
    catch (e) { alert(e.response?.data?.message); }
    finally { setLoading(false); }
  };

  const reject = async () => {
    await api.post(`/admissions/${applicant.id}/reject`, { reason: rejectReason });
    setShowReject(false); onUpdate();
  };

  const [savingInterview, setSavingInterview] = useState(false);
  const saveInterview = async () => {
    if (savingInterview) return;
    // Clamp the score to 0-10. The HTML min/max attributes don't enforce on
    // paste/programmatic input, so a "1000" could otherwise reach the API.
    if (interviewScore !== '' && interviewScore !== null && interviewScore !== undefined) {
      const n = Number(interviewScore);
      if (!Number.isFinite(n) || n < 0 || n > 10) {
        alert('Interview score must be between 0 and 10.');
        return;
      }
    }
    setSavingInterview(true);
    try {
      await api.post(`/admissions/${applicant.id}/interview`, { interviewScore, interviewNotes });
      await refresh();
    } catch (e) {
      alert(e?.response?.data?.error || 'Failed to save interview.');
    } finally {
      setSavingInterview(false);
    }
  };

  const canAdvance = applicant.pipelineStage !== 'ENROLLED' && applicant.pipelineStage !== 'REJECTED';
  const stageIdx = STAGES.indexOf(applicant.pipelineStage);
  const nextStage = STAGES[stageIdx + 1];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,43,74,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
      <div style={{ width: 600, height: '100%', background: '#fff', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #DDE1E7', background: '#0F2B4A', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#C9920A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
              {applicant.firstName?.[0]}{applicant.lastName?.[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700 }}>{applicant.firstName} {applicant.lastName}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{applicant.applicationNo} · {applicant.programmeName}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <Badge color={String(applicant.studentType || '').toUpperCase() === 'DOMESTIC' ? 'navy' : 'teal'} style={{ fontSize: 11 }}>{applicant.studentType}</Badge>
                <Badge color="gold" style={{ fontSize: 11, background: 'rgba(201,146,10,0.2)', color: '#F5E6BE', borderColor: 'rgba(201,146,10,0.4)' }}>{STAGE_LABELS[applicant.pipelineStage]}</Badge>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* Stage actions */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid #DDE1E7', background: '#FDFBF7', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canAdvance && nextStage && (
            <Btn size="sm" onClick={advance} disabled={loading}>Advance → {STAGE_LABELS[nextStage]}</Btn>
          )}
          {/* Accept is only legal from INTERVIEW_DONE or WAITLISTED — and the server
              additionally requires both references RECEIVED. Hiding the button on
              earlier stages stops officers from issuing a real student account
              for an applicant that hasn't been screened. */}
          {['INTERVIEW_DONE','WAITLISTED'].includes(applicant.pipelineStage) && (
            <Btn size="sm" variant="success" onClick={accept} disabled={loading}>Accept</Btn>
          )}
          {applicant.pipelineStage !== 'ENROLLED' && applicant.pipelineStage !== 'REJECTED' && (
            <Btn size="sm" variant="danger" onClick={() => setShowReject(true)}>Reject</Btn>
          )}
          {applicant.pipelineStage === 'ACCEPTED' && (
            <Btn size="sm" variant="gold" onClick={async () => { await api.post(`/admissions/${applicant.id}/enroll`); onUpdate(); }}>Confirm Enrollment</Btn>
          )}
        </div>

        {/* Tabs */}
        <div style={{ padding: '0 24px' }}>
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'personal', label: 'Personal' },
            { value: 'academic', label: 'Academic' },
            { value: 'docs', label: 'Documents' },
            { value: 'interview', label: 'Interview' },
            { value: 'spiritual', label: 'Spiritual' },
          ]} />
        </div>

        <div style={{ flex: 1, padding: '16px 24px' }}>
          {tab === 'personal' && (
            (() => {
              const isDomestic = String(applicant.studentType || '').toUpperCase() === 'DOMESTIC';
              const showSpouse = applicant.spouseName && String(applicant.maritalStatus || '').toLowerCase() !== 'single';
              const showChildren = !!applicant.childrenInfo;
              const universalRows = [
                ['Full Name', `${applicant.firstName || ''} ${applicant.lastName || ''}`.trim()],
                ['Email', applicant.email],
                ['Phone', applicant.phone],
                ['WhatsApp', applicant.whatsapp],
                ['DOB', applicant.dob],
                ['Gender', applicant.gender],
                ['Place of Birth', applicant.placeOfBirth],
                ['Nationality', applicant.nationality],
                ['Mother Tongue', applicant.motherTongue],
                ['Marital Status', applicant.maritalStatus],
                ...(showSpouse  ? [['Spouse Name', applicant.spouseName]] : []),
                ...(showChildren ? [['Children', applicant.childrenInfo]] : []),
                ['Emergency Contact', applicant.emergencyContact],
                ['Applied', applicant.createdAt ? new Date(applicant.createdAt).toLocaleDateString('en-IN') : ''],
              ];
              return (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {universalRows.map(([l,v]) => (
                      <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                        <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 13, color: '#1A1D23', fontWeight: 500 }}>{valueOrDash(v)}</div>
                      </div>
                    ))}
                    {applicant.referralCode && (
                      <div style={{ padding: '8px 12px', background: '#FFFBF0', borderRadius: 6, border: '1px solid #F5E6BE', gridColumn: '1/-1' }}>
                        <div style={{ fontSize: 11, color: '#92400E', marginBottom: 2 }}>Referral Code</div>
                        <div style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>{applicant.referralCode}</div>
                      </div>
                    )}
                  </div>

                  {/* Address subsections branch on studentType. Domestic applicants
                      supply present + permanent addresses; international supply
                      country/city of residence + passport. */}
                  {isDomestic ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2B4A', margin: '20px 0 8px' }}>Present address</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          ['Address', applicant.presentAddressLine],
                          ['State', applicant.presentAddressState],
                          ['Country', applicant.presentAddressCountry],
                          ['PIN code', applicant.presentAddressPin],
                        ].map(([l,v]) => (
                          <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                            <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
                            <div style={{ fontSize: 13, color: '#1A1D23', fontWeight: 500 }}>{valueOrDash(v)}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2B4A', margin: '16px 0 8px' }}>Permanent address</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          ['Address', applicant.permanentAddressLine],
                          ['State', applicant.permanentAddressState],
                          ['Country', applicant.permanentAddressCountry],
                          ['PIN code', applicant.permanentAddressPin],
                        ].map(([l,v]) => (
                          <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                            <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
                            <div style={{ fontSize: 13, color: '#1A1D23', fontWeight: 500 }}>{valueOrDash(v)}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2B4A', margin: '20px 0 8px' }}>Residence</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          ['Country of residence', applicant.countryOfResidence],
                          ['City of residence', applicant.cityOfResidence],
                        ].map(([l,v]) => (
                          <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                            <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
                            <div style={{ fontSize: 13, color: '#1A1D23', fontWeight: 500 }}>{valueOrDash(v)}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2B4A', margin: '16px 0 8px' }}>Passport</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        {[
                          ['Number', applicant.passportNumber],
                          ['Country of issue', applicant.passportCountryOfIssue],
                        ].map(([l,v]) => (
                          <div key={l} style={{ padding: '8px 12px', background: '#F8F9FA', borderRadius: 6 }}>
                            <div style={{ fontSize: 11, color: '#7B8494', marginBottom: 2 }}>{l}</div>
                            <div style={{ fontSize: 13, color: '#1A1D23', fontWeight: 500 }}>{valueOrDash(v)}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()
          )}

          {tab === 'docs' && (
            // Phase 2's 14 docTypes are camelCase; pre-Phase-2 admin-uploaded
            // docs use snake_case. We render whatever's in applicant.documents
            // directly — no hardcoded vocabulary — and humanize the docType
            // string for display. Signed-URL downloads land in Phase 2d.
            (() => {
              const docs = Array.isArray(applicant.documents) ? applicant.documents : [];
              if (docs.length === 0) {
                return (
                  <div style={{ padding: '20px 0', fontSize: 13, color: '#7B8494' }}>
                    No documents uploaded.
                  </div>
                );
              }
              return (
                <div>
                  {docs.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #DDE1E7', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, color: '#3D4450', fontWeight: 500 }}>
                          {humanizeDocType(d.docType)}
                        </div>
                        <div style={{ fontSize: 12, color: '#7B8494', marginTop: 2, wordBreak: 'break-all' }}>
                          {valueOrDash(d.fileName)}
                          {typeof d.fileSize === 'number' && d.fileSize > 0 ? ` · ${formatBytes(d.fileSize)}` : ''}
                        </div>
                      </div>
                      <Badge color={d.verified ? 'green' : 'amber'}>{d.verified ? 'Verified' : 'Received'}</Badge>
                    </div>
                  ))}
                </div>
              );
            })()
          )}

          {tab === 'interview' && (
            <div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Interview Score (1–10)</label>
                <input type="number" min={1} max={10} value={interviewScore} onChange={e => setInterviewScore(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, width: 80 }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: '#3D4450', display: 'block', marginBottom: 6 }}>Notes</label>
                <textarea value={interviewNotes} onChange={e => setInterviewNotes(e.target.value)}
                  style={{ width: '100%', minHeight: 120, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, fontFamily: 'DM Sans', boxSizing: 'border-box' }} />
              </div>
              <Btn onClick={saveInterview} disabled={savingInterview}>{savingInterview ? 'Saving…' : 'Save Interview Notes'}</Btn>
            </div>
          )}

          {tab === 'academic' && (
            // Renders from the JSON snapshot via flatten()'s educationEntries +
            // languages keys; the relation tables (ApplicantEducation /
            // ApplicantLanguage) are partially populated due to known write-side
            // mismatches (yearOfPassing → yearOfCompletion, readWrite / speak /
            // understand → canSpeak / canRead / canWrite + missing 'understand'
            // column). Phase 2d cleans those up; until then we read the richer
            // formData._public arrays as the source of truth.
            (() => {
              const edu = Array.isArray(applicant.educationEntries) ? applicant.educationEntries : [];
              const lang = Array.isArray(applicant.languages) ? applicant.languages : [];
              if (edu.length === 0 && lang.length === 0) {
                return (
                  <div style={{ padding: '20px 0', fontSize: 13, color: '#7B8494' }}>
                    No academic information available.
                  </div>
                );
              }
              return (
                <div>
                  {edu.length > 0 && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2B4A', margin: '0 0 10px' }}>Education ({edu.length})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
                        {edu.map((e, i) => (
                          <div key={e.id || i} style={{ background: '#F8F9FA', borderRadius: 8, padding: '12px 14px' }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#0F2B4A', marginBottom: 6 }}>
                              {valueOrDash(e.qualification)}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                              <div>
                                <div style={{ color: '#7B8494' }}>Institution</div>
                                <div style={{ color: '#1A1D23' }}>{valueOrDash(e.institutionName)}</div>
                              </div>
                              <div>
                                <div style={{ color: '#7B8494' }}>Board / University</div>
                                <div style={{ color: '#1A1D23' }}>{valueOrDash(e.boardOrUniversity)}</div>
                              </div>
                              <div>
                                <div style={{ color: '#7B8494' }}>Year of Passing</div>
                                <div style={{ color: '#1A1D23' }}>{valueOrDash(e.yearOfPassing ?? e.yearOfCompletion)}</div>
                              </div>
                              <div>
                                <div style={{ color: '#7B8494' }}>Percentage / Grade</div>
                                <div style={{ color: '#1A1D23' }}>{valueOrDash(e.percentageOrGrade)}</div>
                              </div>
                              <div style={{ gridColumn: '1/-1' }}>
                                <div style={{ color: '#7B8494' }}>Language of Instruction</div>
                                <div style={{ color: '#1A1D23' }}>{valueOrDash(e.languageOfInstruction)}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {lang.length > 0 && (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F2B4A', margin: '0 0 10px' }}>Languages ({lang.length})</div>
                      <div style={{ background: '#F8F9FA', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 0, padding: '8px 12px', background: '#EEF1F4', fontSize: 11, fontWeight: 600, color: '#5A6272', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                          <div>Language</div>
                          <div>Read/Write</div>
                          <div>Speak</div>
                          <div>Understand</div>
                        </div>
                        {lang.map((l, i) => (
                          <div key={l.id || i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 0, padding: '10px 12px', borderTop: '1px solid #DDE1E7', fontSize: 13, color: '#1A1D23' }}>
                            <div style={{ fontWeight: 500 }}>{valueOrDash(l.language)}</div>
                            <div>{yesNoOrDash(l.readWrite)}</div>
                            <div>{yesNoOrDash(l.speak)}</div>
                            <div>{yesNoOrDash(l.understand)}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })()
          )}

          {tab === 'spiritual' && (
            <div>
              <div style={{ padding: '12px 16px', background: '#F8F9FA', borderRadius: 8, fontSize: 13, color: '#3D4450', whiteSpace: 'pre-wrap' }}>
                {applicant.statementOfFaith || 'No statement of faith recorded.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {showReject && (
        <Modal title="Reject Applicant" onClose={() => setShowReject(false)}>
          <p style={{ fontSize: 13, color: '#7B8494', marginBottom: 12 }}>Please provide a reason (for internal records only).</p>
          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
            style={{ width: '100%', minHeight: 80, padding: '10px 12px', border: '1px solid #DDE1E7', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="outline" onClick={() => setShowReject(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={reject}>Reject Applicant</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
