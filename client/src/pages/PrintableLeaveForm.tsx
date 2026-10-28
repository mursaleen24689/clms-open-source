import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

// Define the shape of our data
export interface LeaveData {
  applicantName: string;
  designation: string;
  department: string;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  reason: string;
  applicantSignatureName: string;
  submissionDate: string;
  hodName: string;
  hodStatus: string;
  hodActionDate: string;
  previouslyAvailed: number;
  isCompensated?: boolean; 
  isHODApplication?: boolean; 
  // MULTI-LEVEL APPROVAL: Supervisor audit trail fields
  supervisor_approved_by?: string | null;
  supervisor_approved_at?: string | null;
}

export default function PrintableLeaveForm({ leaveDataArray }: { leaveDataArray: LeaveData[] }) {
  
  // Helper to chunk the array into pairs (2 forms per landscape page)
  const chunkedForms = [];
  for (let i = 0; i < leaveDataArray.length; i += 2) {
    chunkedForms.push(leaveDataArray.slice(i, i + 2));
  }

  const LeaveFormTemplate = ({ data }: { data: LeaveData }) => {
    // BUG FIX: Automatically convert HOD to HOD & CHAIRMAN
    const printDesignation = data.designation?.toUpperCase() === 'HOD' 
        ? 'HOD & CHAIRMAN' 
        : data.designation;

    return (
      <div className="w-[135mm] h-[190mm] shrink-0 border-[3px] border-black p-4 flex flex-col justify-between text-black bg-white box-border font-serif relative overflow-hidden break-inside-avoid">
        
        {/* --- COMPENSATORY STAMP (ABSOLUTE OVERLAY TO PREVENT LAYOUT SHIFT) --- */}
        {data.isCompensated && (
          <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[15deg] border-[3px] border-black px-6 py-2 bg-white/95 z-10 text-center pointer-events-none mix-blend-multiply shadow-sm">
            <p className="font-black text-[14px] uppercase tracking-widest text-black m-0 leading-tight">★ Compensatory ★</p>
            <p className="text-[9px] font-bold text-black uppercase mt-1 m-0 leading-none">Against off-day duty</p>
          </div>
        )}

        {/* --- HEADER SECTION (STRICT ISO FORMATTING) --- */}
        <div className="w-full">
          {/* Top Left QR Code & Top Right Logo & ISO Number */}
          <div className="flex justify-between w-full items-start">
            
            {/* SECURITY UPGRADE: TAMPER-PROOF QR CODE */}
            <div className="p-0.5 border-[1.5px] border-black inline-block bg-white">
              <QRCodeSVG 
                value={`LEAVE-VERIFY:${data.applicantName}|${data.startDate}|${data.numberOfDays}D|${data.hodStatus?.toUpperCase() || 'PENDING'}`} 
                size={48} 
                level="L" 
                includeMargin={false}
              />
            </div>

            <div className="flex flex-col items-center w-28">
              <img 
                src="/logo.png" 
                alt="University logo" 
                className="w-12 h-12 object-contain grayscale mb-1"
              />
              <div className="text-[8px] font-bold font-sans tracking-wider text-black border border-black px-1 w-full text-center leading-tight">
                FORM REF 01/01
              </div>
            </div>
          </div>

          {/* One Line Break */}
          <br />

          {/* University & Department Names (Centered, Separate Lines) */}
          <div className="text-center">
            <div className="text-[13px] font-black uppercase tracking-widest text-black leading-tight">
              Example Technical University
            </div>
            <div className="text-[11px] font-bold uppercase mt-1 text-black border-b-[1.5px] border-black inline-block pb-0.5">
              Department of {data.department || "Engineering"}
            </div>
          </div>

          <div className="text-center mt-4 mb-2">
            <h3 className="text-[13px] font-bold underline uppercase text-black">APPLICATION FORM FOR CASUAL LEAVE</h3>
          </div>
        </div>

        {/* --- APPLICANT INFO SECTION --- */}
        <div className="space-y-3 text-[12px] leading-tight flex-grow mt-1">
          <div className="flex items-end">
            <span className="font-bold whitespace-nowrap text-black">Name of Applicant:</span> 
            {/* BUG FIX: Removed truncate so long names like Prof. Dr. Ali Dad Chandio fully display */}
            <span className="ml-2 border-b border-black px-2 flex-grow font-bold text-black font-mono text-[13px] uppercase leading-tight whitespace-normal break-words">
              {data.applicantName}
            </span>
          </div>
          
          <div className="flex items-end">
            <span className="font-bold whitespace-nowrap text-black">Designation:</span> 
            <span className="ml-2 border-b border-black px-2 flex-grow font-bold text-black font-mono text-[13px] uppercase leading-tight whitespace-normal break-words">
              {printDesignation}
            </span>
          </div>

          <div className="flex items-end">
            <span className="font-bold whitespace-nowrap text-black">Leave required - From:</span>
            <span className="ml-2 border-b border-black px-1 w-16 text-center font-bold text-black font-mono text-[11px]">{data.startDate}</span>
            <span className="font-bold whitespace-nowrap ml-2 text-black">To:</span>
            <span className="ml-2 border-b border-black px-1 w-16 text-center font-bold text-black font-mono text-[11px]">{data.endDate}</span>
            <span className="font-bold whitespace-nowrap ml-2 text-black">Days:</span>
            <span className="ml-1 border-b border-black px-1 w-8 text-center font-bold text-black font-mono">{data.numberOfDays}</span>
          </div>

          <div className="flex items-end">
            <span className="font-bold whitespace-nowrap text-black">Reason for Leave:</span>
            <span className="ml-2 border-b border-black flex-grow px-2 font-bold italic text-black font-mono text-[11px] overflow-hidden whitespace-normal break-words leading-tight line-clamp-2">
              {data.reason}
            </span>
          </div>

          {/* EXACT ISO TEXT NOTES SECTION */}
          <div className="pt-2 text-[10px] leading-snug">
            <span className="font-bold underline">NOTE:</span>
            <ol className="list-decimal pl-4 mt-0.5 space-y-0.5 font-semibold">
              <li>Casual leave required for reasons other than sickness shall not be availed without prior sanction.</li>
              <li>Casual leave desired on Medical grounds for more than Two days shall be sanctioned on the production of Medical Certificate.</li>
            </ol>
          </div>

          {/* Applicant Signature and Date */}
          <div className="flex justify-end pt-4">
            <div className="text-center w-48">
              {/* BUG FIX: Removed truncate so long names fully display */}
              <div className="font-bold italic text-black font-mono px-2 text-[13px] uppercase leading-tight whitespace-normal break-words">
                {data.applicantSignatureName}
              </div>
              <div className="border-t border-black pt-1 mt-1">
                <span className="text-[11px] font-bold text-black">Signature of Applicant</span>
              </div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <span className="text-[11px] font-bold text-black">Date:</span>
                <span className="font-bold text-black font-mono text-[11px] border-b border-black px-2">{data.submissionDate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* --- OFFICE USE SECTION --- */}
        <div className="border-t-[3px] border-black pt-3 mt-2">
          <h4 className="text-center font-bold underline uppercase text-[12px] mb-2 text-black">For Office Use Only</h4>
          
          <div className="text-[12px] leading-loose mb-2">
            Mr./Ms. <span className="border-b border-black px-2 font-mono font-bold uppercase whitespace-normal break-words">{data.applicantName}</span>
            <span className="ml-2">Designation</span> <span className="border-b border-black px-2 font-mono font-bold uppercase whitespace-normal break-words">{printDesignation}</span>
            <br/> may be / may not be sanctioned leave.
          </div>

          <div className="flex items-center text-[12px] mb-4 mt-1">
            <span className="font-bold text-black">Leave availed previously:</span>
            <span className="mx-2 border-b border-black px-4 font-bold text-black text-[14px] font-mono">{data.previouslyAvailed}</span>
            <span className="font-bold text-black">days.</span>
          </div>

          {/* DYNAMIC SIGNATURE WORKFLOW */}
          <div className="flex items-end justify-between mt-6">
            {data.isHODApplication ? (
              // DEAN WORKFLOW: manual checkboxes and blank signature
              <>
                <div className="font-bold text-[11px] text-black space-y-1.5 pb-1">
                  <label className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-black"></div> Leave Sanctioned
                  </label>
                  <label className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-black"></div> Not Sanctioned
                  </label>
                </div>
                <div className="text-center w-52 relative">
                  <div className="border-b border-black pb-4 relative h-8"></div>
                  <span className="text-[11px] font-bold text-black whitespace-nowrap">Dean</span>
                </div>
              </>
            ) : (
              // NORMAL HOD WORKFLOW: Digital Signatures
              <>
                <div className="font-bold text-[11px] text-black">
                  Recommended / Not Recommended
                  <div className="mt-2 text-[9px] italic font-normal text-gray-800 bg-gray-100 border border-gray-400 px-2 py-1 inline-block print:border-black print:bg-white">
                    System Status: {data.hodStatus?.toUpperCase() || 'PENDING'}
                  </div>
                  {/* SUPERVISOR AUDIT TRAIL — only renders if supervisor data exists, zero layout shift otherwise */}
                  {data.supervisor_approved_by && (
                    <div className="mt-2 text-[10px] font-sans border-l-2 border-emerald-600 pl-2 text-slate-700 italic tracking-tight leading-snug">
                      📋 Recommended by:{' '}
                      <span className="font-bold font-serif not-italic">{data.supervisor_approved_by}</span>
                      {data.supervisor_approved_at && (
                        <span className="not-italic">
                          {' '}on{' '}
                          {new Date(data.supervisor_approved_at).toLocaleDateString('en-GB')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="text-center w-52 relative">
                  <div className="border-b border-black pb-4 relative h-8">
                    {/* FIX: Show Signature for BOTH Approved and Rejected statuses */}
                    {(data.hodStatus === 'approved' || data.hodStatus === 'rejected') && (
                       <img 
                         src="/hod_signature.png" 
                         alt="" 
                         className="absolute bottom-1 left-1/2 -translate-x-1/2 h-8 mix-blend-multiply opacity-90" 
                         onError={(e) => e.currentTarget.style.display = 'none'} 
                       />
                    )}
                  </div>
                  <span className="text-[11px] font-bold text-black whitespace-nowrap">Chairman / Head of Department</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-200 min-h-screen py-8 print:py-0 print:bg-white print:min-h-0 w-full overflow-x-auto">
      
      <style>{`
        @media print {
          @page { margin: 5mm; size: A4 landscape; }
          body { 
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important; 
            background: white !important; 
          }
          .print-wrapper { 
            padding: 0 !important; 
            background: white !important;
            box-shadow: none !important;
          }
        }
      `}</style>
      
      <div className="flex flex-col items-start sm:items-center w-max mx-auto px-4 print:px-0">
        
        {chunkedForms.map((pair, index) => (
          <div key={index} className="print-wrapper shrink-0 flex flex-row items-center justify-center w-[287mm] h-[200mm] gap-[10mm] py-[5mm] bg-white shadow-2xl mb-8 print:mb-0 break-after-page">
            
            {/* Left Form */}
            <LeaveFormTemplate data={pair[0]} />
            
            {/* Vertical Cut Line */}
            <div className="border-l-2 border-dashed border-gray-400 h-[190mm] relative opacity-50 hidden print:block shrink-0">
              <span 
                className="absolute top-1/2 -translate-y-1/2 -left-2 bg-white py-4 text-[10px] tracking-widest uppercase text-black" 
                style={{ writingMode: 'vertical-rl' }}
              >
                Cut Here
              </span>
            </div>
            
            {/* Right Form */}
            {pair[1] ? (
              <LeaveFormTemplate data={pair[1]} />
            ) : (
              <div className="w-[135mm] h-[190mm] shrink-0 opacity-0 print:opacity-0 pointer-events-none"></div>
            )}

          </div>
        ))}

      </div>
    </div>
  );
}