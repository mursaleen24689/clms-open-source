import { useState, useEffect } from "react";
import MemoSystem from "./MemoSystem";
import DOMPurify from 'dompurify';

// SECURITY/BUG FIX: Timezone-proof Date Parsing
const parseLocalDate = (dateString: string) => {
  if (!dateString) return new Date();
  const [year, month, day] = dateString.split('T')[0].split('-');
  return new Date(Number(year), Number(month) - 1, Number(day));
};

export default function EmployeeDashboard() {
  const [userData, setUserData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  
  // Multi-day leave states
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [numberOfDays, setNumberOfDays] = useState(0);
  const [isSandwich, setIsSandwich] = useState(false); 
  const [overlappingHolidays, setOverlappingHolidays] = useState(0);
  const [holidays, setHolidays] = useState<any[]>([]);
  
  const [reason, setReason] = useState("");
  const [newPassword, setNewPassword] = useState("");
  
  // State for password strength
  const [passwordStrength, setPasswordStrength] = useState(0);

  // Futuristic Modal States
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  // NOTIFICATION STATES
  const [notifications, setNotifications] = useState<{count: number, messages: string[]}>({ count: 0, messages: [] });
  const [showNotifications, setShowNotifications] = useState(false);

  // --- HELP DESK / SUPPORT TICKET STATES ---
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [ticketFile, setTicketFile] = useState<File | null>(null);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(false);

  // --- PROFILE SYSTEM STATES ---
  const [showProfile, setShowProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [profileEdit, setProfileEdit] = useState({
    name: '', designation: '', persNo: '', bps: '', phone: '', email: '', profilePicBase64: ''
  });

  // SECURITY UPGRADE & FALLBACK: Check both storages
  const [activeTab, setActiveTab] = useState<'leave' | 'memo'>('leave');

  const username = sessionStorage.getItem("username") || localStorage.getItem("username") || "";
  const token = sessionStorage.getItem("token") || "";

  // BUG FIX: Clean redirect to login page to break the infinite loading loop
  const handleLogout = () => {
    sessionStorage.clear();
    localStorage.clear();
    window.location.replace("/"); 
  };

  // AUTO-LOGOUT FLOW: Detects 30 mins of mouse/keyboard inactivity
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => handleLogout(), 30 * 60 * 1000);
    };
    window.addEventListener('mousemove', resetTimeout);
    window.addEventListener('keydown', resetTimeout);
    resetTimeout();
    return () => {
      window.removeEventListener('mousemove', resetTimeout);
      window.removeEventListener('keydown', resetTimeout);
      clearTimeout(timeout);
    };
  }, []);

  // CACHE BUSTING FIX & NOTIFICATION FETCH
  const fetchData = () => {
    const headers = { 'Authorization': `Bearer ${token}` };

    fetch(`/api/user-details?username=${username}&_t=${Date.now()}`, { headers })
      .then(res => res.json())
      .then(data => {
        setUserData(data);
        setProfileEdit({
          name: data.name || '',
          designation: data.designation || '',
          persNo: data.persNo || '',
          bps: data.bps || '',
          phone: data.phone || '',
          email: data.email || '',
          profilePicBase64: data.profilePic || ''
        });
      })
      .catch(err => console.error("Failed to load user data"));

    fetch(`/api/my-leaves?username=${username}&_t=${Date.now()}`, { headers })
      .then(res => res.json())
      .then(data => setHistory(data))
      .catch(err => console.error("Failed to load history"));
      
    fetch(`/api/admin/holidays?_t=${Date.now()}`, { headers })
      .then(res => res.json())
      .then(data => setHolidays(data))
      .catch(() => setHolidays([]));

    // Fetch Notifications securely with "Mark as Read" logic
    fetch(`/api/notifications?_t=${Date.now()}`, { headers })
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.messages)) {
          const viewedTracker = localStorage.getItem(`read_notifs_${username}`);
          const currentMessagesStr = JSON.stringify(data.messages);
          if (viewedTracker === currentMessagesStr) {
            setNotifications({ count: 0, messages: data.messages });
          } else {
            setNotifications(data);
          }
        } else {
          setNotifications({ count: 0, messages: [] });
        }
      })
      .catch(() => setNotifications({ count: 0, messages: [] }));
  };

  useEffect(() => { 
    if (username) fetchData(); 
  }, [username]);

  // SMART MATH: Calculate days, detect Sandwich, and subtract Public Holidays
  const calculateDays = (start: string, end: string) => {
    if (start && end) {
      const d1 = parseLocalDate(start);
      const d2 = parseLocalDate(end);
      
      if (d2 < d1) {
        setNumberOfDays(0);
        setIsSandwich(false);
        setOverlappingHolidays(0);
        return;
      }

      const diffTime = Math.abs(d2.getTime() - d1.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      let weekendFound = false;
      let holidaysFound = 0;
      let currentDate = new Date(d1);
      
      while (currentDate <= d2) {
        const dayOfWeek = currentDate.getDay();
        const yyyy = currentDate.getFullYear();
        const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentDate.getDate()).padStart(2, '0');
        const dateString = `${yyyy}-${mm}-${dd}`;
        
        if (dayOfWeek === 0 || dayOfWeek === 6) { 
          weekendFound = true;
        }
        
        const isHoliday = holidays.some(h => h.date.split('T')[0] === dateString);
        if (isHoliday && dayOfWeek !== 0 && dayOfWeek !== 6) {
           holidaysFound++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const finalChargedDays = diffDays - holidaysFound;
      setNumberOfDays(finalChargedDays > 0 ? finalChargedDays : 0);
      
      const startDOW = d1.getDay();
      const endDOW = d2.getDay();
      const isStartWeekday = startDOW !== 0 && startDOW !== 6;
      const isEndWeekday = endDOW !== 0 && endDOW !== 6;
      
      setIsSandwich(weekendFound && isStartWeekday && isEndWeekday && diffDays >= 3);
      setOverlappingHolidays(holidaysFound);

    } else {
      setNumberOfDays(0);
      setIsSandwich(false);
      setOverlappingHolidays(0);
    }
  };

  const handleStartDateChange = (e: any) => {
    const newDate = e.target.value;
    setStartDate(newDate);
    calculateDays(newDate, endDate);
  };

  const handleEndDateChange = (e: any) => {
    const newDate = e.target.value;
    setEndDate(newDate);
    calculateDays(startDate, newDate);
  };

  let daysTakenThisMonth = 0;
  if (startDate) {
     const targetMonth = parseLocalDate(startDate).getMonth();
     const targetYear = parseLocalDate(startDate).getFullYear();
     history.forEach((l: any) => {
        if (l.status === 'approved' && !l.isCompensated) {
           const lDate = parseLocalDate(l.startDate);
           if (lDate.getMonth() === targetMonth && lDate.getFullYear() === targetYear) {
              daysTakenThisMonth += (Number(l.numberOfDays) || 1);
           }
        }
     });
  }
  const isExceedingMonthlyPolicy = (daysTakenThisMonth + numberOfDays) > 2;

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (numberOfDays <= 0 && overlappingHolidays === 0) {
      alert("Invalid date range. End date must be on or after the start date.");
      return;
    }
    
    const selectedDateStr = startDate.split('T')[0];
    const holidayMatch = holidays.find(h => h.date.split('T')[0] === selectedDateStr);

    if (holidayMatch) {
      const proceed = window.confirm(`⚠️ HOLIDAY ALERT: ${selectedDateStr} is "${holidayMatch.name}". \n\nNormally, you don't need to apply for leave on a holiday.\n\nDid you work on this day and wish to submit this for Compensation?`);
      if (!proceed) return;
    }

    setConsentGiven(false);
    setShowConfirmModal(true);
  };

  const handleFinalSubmit = async () => {
    if (!consentGiven || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/submit-leave', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username, startDate, endDate, numberOfDays, reason })
      });

      const data = await response.json();

      if (response.ok) {
        setShowConfirmModal(false);
        setShowSuccessModal(true); 
        setStartDate(""); setEndDate(""); setNumberOfDays(0); setIsSandwich(false); setOverlappingHolidays(0); setReason("");
        fetchData(); 
      } else {
        alert(`⚠️ ${data.error || "Failed to secure the leave request."}`);
        setShowConfirmModal(false);
      }
    } catch (err) {
      alert("Secure server connection failed.");
      setShowConfirmModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordStrength < 3) {
      alert("Password is too weak! Must be 12+ chars with uppercase, lowercase, and numbers.");
      return;
    }
    try {
      const response = await fetch('/api/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username, newPass: newPassword })
      });

      if (response.ok) {
        alert("Password updated successfully! Please remember your new cryptographic key.");
        setNewPassword(""); setPasswordStrength(0);
      } else {
        const data = await response.json();
        alert(`Failed: ${data.error || "Could not update credentials."}`);
      }
    } catch (err) {
      alert("Server error. Try again later.");
    }
  };

  const handleCancelLeave = async (id: number) => {
    if (!window.confirm("Are you sure you want to withdraw this pending leave request?")) return;
    try {
      const res = await fetch(`/api/my-leaves/${id}`, { 
        method: 'DELETE', 
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        alert("Leave application withdrawn successfully.");
        setHistory(prev => prev.filter(record => record.id !== id));
        fetchData(); 
      } else {
        alert(`Error: ${data.error || "Could not withdraw leave."}`);
      }
    } catch (err) {
      alert("Server error connecting to database.");
    }
  };

  const handleProfileSubmit = async () => {
    setIsSubmittingProfile(true);
    try {
      const response = await fetch('/api/profile-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ ...profileEdit, username })
      });
      if (response.ok) {
        alert("Profile update requested successfully! Pending IT Admin approval.");
        setShowProfile(false); setIsEditingProfile(false);
      } else {
        alert("Failed to submit profile update request.");
      }
    } catch (err) {
      alert("Network error.");
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        alert("Profile picture must be less than 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        setProfileEdit({ ...profileEdit, profilePicBase64: reader.result as string });
      };
    }
  };

  const handleTicketFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        alert("File size exceeds the 10MB limit.");
        e.target.value = ""; 
        return;
      }
      setTicketFile(file);
    }
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingTicket(true);
    let fileBase64 = null; let fileName = null;
    if (ticketFile) {
      fileName = ticketFile.name;
      const reader = new FileReader();
      reader.readAsDataURL(ticketFile);
      await new Promise<void>((resolve) => {
        reader.onload = () => { fileBase64 = reader.result; resolve(); };
      });
    }

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ username, subject: ticketSubject, message: ticketMessage, fileName, fileBase64 })
      });

      if (response.ok) {
        setTicketSuccess(true);
        setTicketSubject(""); setTicketMessage(""); setTicketFile(null);
        setTimeout(() => setTicketSuccess(false), 5000);
      } else {
        alert("Failed to submit support ticket.");
      }
    } catch (err) {
      alert("Network error while submitting ticket.");
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  if (!userData) {
    return <div className="p-20 text-center font-bold text-[#006141] animate-pulse">Establishing Secure Connection to Profile...</div>;
  }

  const projectedBalance = userData.balance - numberOfDays;
  const lwpDays = projectedBalance < 0 ? Math.abs(projectedBalance) : 0;

  return (
    <div className="space-y-6 pb-20 relative min-h-screen bg-slate-50 p-4 md:p-8">
      
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-all overflow-y-auto pt-20 pb-10">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative">
            <div className="bg-[#006141] p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-2"><span>👤</span> My Profile Details</h3>
              <button onClick={() => { setShowProfile(false); setIsEditingProfile(false); }} className="text-white hover:text-red-300 font-bold text-3xl leading-none">&times;</button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="flex flex-col md:flex-row gap-8 items-center md:items-start border-b border-slate-100 pb-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-32 h-32 rounded-full border-4 border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center relative group">
                    {profileEdit.profilePicBase64 || userData?.profilePic ? (
                      <img src={profileEdit.profilePicBase64 || userData.profilePic} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-5xl text-slate-300 font-black">{userData?.name?.charAt(0) || '?'}</span>
                    )}
                    {isEditingProfile && (
                      <label className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer font-bold text-xs uppercase transition-all backdrop-blur-sm">
                        Upload Picture
                        <input type="file" accept="image/png, image/jpeg, image/gif" className="hidden" onChange={handleProfilePicChange} />
                      </label>
                    )}
                  </div>
                  {isEditingProfile && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">Format: JPG, PNG, GIF<br/>Max Size: 2MB</p>}
                </div>

                <div className="flex-1 w-full space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Full Legal Name</label>
                    <input type="text" required disabled={!isEditingProfile} value={profileEdit.name} onChange={e => setProfileEdit({...profileEdit, name: e.target.value})} className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Designation</label>
                      <input type="text" required disabled={!isEditingProfile} value={profileEdit.designation} onChange={e => setProfileEdit({...profileEdit, designation: e.target.value})} className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">BPS Grade</label>
                      <input type="text" disabled={!isEditingProfile} value={profileEdit.bps} onChange={e => setProfileEdit({...profileEdit, bps: e.target.value})} className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Personal No.</label>
                  <input type="text" disabled={!isEditingProfile} value={profileEdit.persNo} onChange={e => setProfileEdit({...profileEdit, persNo: e.target.value})} className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Phone Number</label>
                  <input type="tel" disabled={!isEditingProfile} value={profileEdit.phone} onChange={e => setProfileEdit({...profileEdit, phone: e.target.value})} className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all font-mono" placeholder="0300-1234567" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Email Address</label>
                  <input type="email" disabled={!isEditingProfile} value={profileEdit.email} onChange={e => setProfileEdit({...profileEdit, email: e.target.value})} className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all" placeholder="user@example.edu" />
                </div>
              </div>

              {isEditingProfile && (
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 flex items-start gap-3">
                  <span className="text-xl leading-none">⚠️</span>
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wide leading-relaxed">
                    Important: For security and audit purposes, all profile changes require approval from the IT Admin before they are applied system-wide.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                {!isEditingProfile ? (
                  <>
                    <button type="button" onClick={() => setShowProfile(false)} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all uppercase tracking-wider text-sm">Close</button>
                    <button type="button" onClick={() => setIsEditingProfile(true)} className="px-8 py-3 rounded-xl font-black bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md uppercase tracking-wider text-sm flex items-center gap-2">✏️ Edit Profile</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setProfileEdit({ name: userData.name || '', designation: userData.designation || '', persNo: userData.persNo || '', bps: userData.bps || '', phone: userData.phone || '', email: userData.email || '', profilePicBase64: userData.profilePic || '' }); setIsEditingProfile(false); }} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all uppercase tracking-wider text-sm">Cancel Edit</button>
                    <button type="button" onClick={handleProfileSubmit} disabled={isSubmittingProfile} className="px-8 py-3 rounded-xl font-black bg-[#006141] text-white hover:bg-[#004d34] disabled:bg-slate-300 transition-all shadow-md uppercase tracking-wider text-sm flex items-center gap-2">{isSubmittingProfile ? 'Transmitting...' : 'Submit for Approval'}</button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100 opacity-100">
            <div className="bg-[#006141] p-6 text-white border-b-4 border-yellow-400">
              <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
                <span className="text-2xl">🛡️</span> Application Verification
              </h3>
              <p className="text-green-100 text-sm mt-1 font-medium">Please review and lock your data before secure transmission.</p>
            </div>
            <div className="p-6 space-y-5">
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3 shadow-inner">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Leave Window</span>
                  <span className="font-bold text-slate-800 font-mono">
                    {parseLocalDate(startDate).toLocaleDateString('en-GB')} <span className="text-slate-400">to</span> {parseLocalDate(endDate || startDate).toLocaleDateString('en-GB')}
                  </span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2 items-center">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Total Duration</span>
                  <span className="font-black text-xl text-[#006141]">{numberOfDays} <span className="text-sm text-slate-600 font-bold">Days</span></span>
                </div>
                <div className="flex flex-col gap-1 pt-1">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Formal Reason</span>
                  <span className="text-slate-800 italic text-sm border-l-2 border-slate-300 pl-3 py-1 bg-white break-words">{reason}</span>
                </div>
              </div>

              <div className={`p-4 rounded-xl border ${lwpDays > 0 ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                 <p className={`text-xs font-black uppercase tracking-widest mb-3 ${lwpDays > 0 ? 'text-red-800' : 'text-blue-800'}`}>Projected Quota Impact</p>
                 <div className="flex justify-between items-center text-sm mb-2"><span className="text-slate-600 font-bold">Current Balance:</span><span className="font-black text-slate-800">{userData.balance} Days</span></div>
                 <div className="flex justify-between items-center text-sm"><span className="text-slate-600 font-bold">Projected Balance:</span><span className={`font-black text-lg ${projectedBalance < 0 ? 'text-red-600' : 'text-blue-700'}`}>{projectedBalance < 0 ? 0 : projectedBalance} Days</span></div>
                 {lwpDays > 0 && <div className="mt-3 bg-red-100 text-red-800 text-[11px] font-black uppercase p-2 rounded border border-red-300 flex items-start gap-2"><span className="text-lg leading-none">⚠️</span><span>Warning: This application exceeds your quota and includes <span className="underline">{lwpDays} Day(s) Leave Without Pay</span>.</span></div>}
              </div>
              
              <div className="flex items-start gap-3 mt-4 bg-slate-50 p-3 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setConsentGiven(!consentGiven)}>
                 <div className="mt-0.5"><input type="checkbox" checked={consentGiven} readOnly className="w-5 h-5 accent-[#006141] cursor-pointer" /></div>
                 <p className="text-xs font-bold text-slate-600 leading-tight">I digitally verify that the above information is accurate and I consent to the projected quota adjustments upon HOD approval.</p>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setShowConfirmModal(false)} disabled={isSubmitting} className="px-5 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-all text-sm uppercase tracking-wider">Cancel</button>
              <button onClick={handleFinalSubmit} disabled={!consentGiven || isSubmitting} className="px-6 py-2.5 rounded-xl font-black bg-[#006141] text-white hover:bg-[#004d34] disabled:bg-slate-300 disabled:cursor-not-allowed transition-all shadow-lg text-sm flex items-center gap-2 uppercase tracking-wider">{isSubmitting ? "Transmitting..." : userData?.supervisor_id ? `🔒 Freeze & Route to ${userData?.supervisor_name || "Supervisor"}` : "🔒 Freeze & Route to HOD"}</button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-8 text-center max-w-sm w-full transform transition-all scale-100 opacity-100 border-t-8 border-[#006141]">
             <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-green-100"><span className="text-5xl">✅</span></div>
             <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Secured & Routed</h3>
             <p className="text-slate-500 font-medium text-sm mb-8 leading-relaxed">Your official leave request has been locked and successfully transmitted to the HOD's dashboard for final review.</p>
             <button onClick={() => setShowSuccessModal(false)} className="w-full py-3.5 bg-slate-800 text-white rounded-xl font-black uppercase tracking-widest hover:bg-slate-900 transition-all shadow-md">Acknowledge</button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-6">
        <header className="bg-[#006141] text-white p-6 md:p-8 rounded-3xl shadow-xl border-l-8 border-yellow-400 flex flex-wrap justify-between items-start md:items-center gap-4 relative z-40">
          <div className="flex items-center gap-4">
            <div className="bg-white p-3 rounded-2xl shadow-lg shadow-emerald-900/20"><img src="/logo.png" alt="University logo" className="h-12 w-12 object-contain grayscale" /></div>
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Welcome back, {userData.name}</h2>
              <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-green-200 opacity-90 mt-1">{userData.role === 'employee' || userData.role === 'staff' ? 'Staff Portal' : `${userData.role} Portal`} • BPS-{userData.bps || '-'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => { setShowProfile(true); setIsEditingProfile(false); }} className="relative w-12 h-12 rounded-xl border border-white/20 overflow-hidden bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center shadow-sm" title="My Profile">
              {userData?.profilePic ? <img src={userData.profilePic} alt="Profile" className="w-full h-full object-cover" /> : <span className="font-black text-white text-lg">{userData?.name?.charAt(0).toUpperCase() || '?'}</span>}
            </button>
            <div className="relative">
              <button onClick={() => { const isOpening = !showNotifications; setShowNotifications(isOpening); if (isOpening && notifications.messages.length > 0) { localStorage.setItem(`read_notifs_${username}`, JSON.stringify(notifications.messages)); setNotifications(prev => ({ ...prev, count: 0 })); } }} className="relative p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all border border-white/20 flex items-center justify-center h-12 w-12">
                <span className="text-2xl">🔔</span>
                {(notifications?.count || 0) > 0 && <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#006141] shadow-md animate-pulse">{notifications.count}</span>}
              </button>
              {showNotifications && (
                <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 transform origin-top-right transition-all">
                  <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center"><h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Recent Activity</h4></div>
                  <div className="max-h-64 overflow-y-auto p-2 bg-white">
                    {(!notifications?.messages || notifications.messages.length === 0) ? <p className="text-slate-400 text-xs font-bold text-center p-6">No recent updates.</p> : notifications.messages.map((msg, idx) => (
                      <div key={idx} className="p-4 bg-blue-50/50 hover:bg-blue-50 text-sm font-semibold text-slate-700 border-b border-slate-100 last:border-0 rounded-lg mb-1 flex items-start gap-3 transition-colors"><span className="text-blue-500 mt-0.5">▪</span><span className="leading-tight">{msg}</span></div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button onClick={handleLogout} className="bg-rose-500 h-12 text-white px-6 rounded-xl font-bold hover:bg-rose-600 transition-all shadow-md uppercase tracking-wider text-sm whitespace-nowrap">Logout Session</button>
          </div>
        </header>

        {/* ── TAB NAVIGATION ── */}
        <div className="flex gap-1 mb-2 relative z-10">
          <button
            onClick={() => setActiveTab('leave')}
            className={`px-6 py-2.5 font-black text-sm uppercase tracking-wider rounded-xl transition-all border-2 ${activeTab === 'leave' ? 'border-[#006141] bg-[#006141] text-white shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
          >
            📋 Casual Leave
          </button>
          <button
            onClick={() => setActiveTab('memo')}
            className={`px-6 py-2.5 font-black text-sm uppercase tracking-wider rounded-xl transition-all border-2 ${activeTab === 'memo' ? 'border-[#006141] bg-[#006141] text-white shadow-md' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
          >
            📝 Internal Memo
          </button>
        </div>

        {/* ── MEMO TAB ── */}
        {activeTab === 'memo' && (
          <MemoSystem userData={userData} />
        )}

        {/* ── LEAVE TAB ── */}
        {activeTab === 'leave' && <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
          <div className="bg-white p-6 rounded-3xl shadow-sm border-t-4 border-[#006141]">
            <span className="text-slate-400 text-xs font-black tracking-widest uppercase">Casual Leave Balance</span>
            <p className="text-5xl font-black text-slate-800 mt-2">{userData.balance} <span className="text-lg opacity-50 font-bold">Days</span></p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <span className="w-2 h-6 bg-[#006141] rounded-full"></span> Apply for Leave
              </h3>
              <form onSubmit={handlePreSubmit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Start Date</label>
                    <input type="date" required value={startDate} onChange={handleStartDateChange} className="w-full border-2 border-transparent bg-slate-50 rounded-2xl p-4 text-sm font-bold focus:border-[#006141] outline-none transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">End Date</label>
                    <input type="date" required value={endDate} onChange={handleEndDateChange} className="w-full border-2 border-transparent bg-slate-50 rounded-2xl p-4 text-sm font-bold focus:border-[#006141] outline-none transition-all" />
                  </div>
                </div>
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 flex flex-col gap-2">
                  <div className="flex justify-between items-center"><span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Days Applied</span><span className={`text-2xl font-black ${numberOfDays > 0 ? 'text-[#006141]' : 'text-red-500'}`}>{numberOfDays}</span></div>
                  {isSandwich && <div className="bg-orange-100 border-l-4 border-orange-500 p-2.5 text-[10px] text-orange-800 font-bold uppercase tracking-wide rounded-r-lg mt-2">⚠️ Sandwich Rule: Weekends included in count.</div>}
                  {overlappingHolidays > 0 && <div className="bg-blue-100 border-l-4 border-blue-500 p-2.5 text-[10px] text-blue-800 font-bold uppercase tracking-wide rounded-r-lg mt-2">🎉 Public Holiday Detected: {overlappingHolidays} day(s) skipped!</div>}
                  {numberOfDays > userData.balance && <div className="bg-red-100 border-l-4 border-red-600 p-2.5 text-[10px] text-red-800 font-bold uppercase tracking-wide rounded-r-lg mt-2">🚨 EXCEEDING QUOTA: The extra {numberOfDays - userData.balance} day(s) will be processed as LEAVE WITHOUT PAY.</div>}
                  {isExceedingMonthlyPolicy && numberOfDays > 0 && <div className="bg-purple-100 border-l-4 border-purple-500 p-2.5 text-[10px] text-purple-800 font-bold uppercase tracking-wide rounded-r-lg mt-2">⚠️ Audit Notice: You are exceeding the recommended 2-Days/Month limit. Your HOD will be notified.</div>}
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Reason</label>
                  <textarea required rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border-2 border-transparent bg-slate-50 rounded-2xl p-4 focus:border-[#006141] outline-none font-medium transition-all"></textarea>
                </div>
                <button type="submit" className="w-full bg-[#006141] text-white font-black py-4 rounded-2xl hover:bg-[#004d34] transition-all shadow-xl shadow-emerald-900/20 uppercase tracking-widest flex items-center justify-center gap-2 mt-4 hover:-translate-y-0.5 active:translate-y-0">Initiate Secure Request ➔</button>
              </form>
            </div>
            <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-sm font-black text-slate-800 mb-6 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 bg-slate-800 rounded-full"></span> Account Settings
              </h3>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 ml-1 uppercase tracking-widest">Update Password</label>
                  <input type="password" required placeholder="Enter new password" value={newPassword} onChange={(e) => { const val = e.target.value; setNewPassword(val); let str = 0; if (val.length >= 12) str++; if (/[A-Z]/.test(val) && /[a-z]/.test(val)) str++; if (/[0-9!@#$%^&*]/.test(val)) str++; setPasswordStrength(str); }} className="w-full border-2 border-transparent bg-slate-50 rounded-2xl p-4 text-sm font-bold focus:border-slate-800 outline-none transition-all" />
                  <div className="flex gap-1 mt-2 px-1">
                    <div className={`h-1.5 w-full rounded-full transition-all ${passwordStrength >= 1 ? 'bg-rose-500' : 'bg-slate-200'}`}></div>
                    <div className={`h-1.5 w-full rounded-full transition-all ${passwordStrength >= 2 ? 'bg-amber-500' : 'bg-slate-200'}`}></div>
                    <div className={`h-1.5 w-full rounded-full transition-all ${passwordStrength >= 3 ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 mt-2 px-1 uppercase tracking-widest">Requires 8+ chars, upper/lower case & numbers</p>
                </div>
                <button type="submit" className="w-full bg-slate-800 text-white text-sm font-bold py-3.5 rounded-2xl hover:bg-slate-900 transition-all shadow-md uppercase tracking-wider">Save New Password</button>
              </form>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm overflow-hidden border border-slate-200 flex flex-col">
            <div className="p-6 md:p-8 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2"><span className="w-2 h-6 bg-blue-500 rounded-full"></span> My Leave History</h3>
            </div>
            <div className="overflow-x-auto flex-grow">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
                  <tr><th className="p-5 border-b border-slate-100">Submitted On</th><th className="p-5 border-b border-slate-100">Start Date</th><th className="p-5 border-b border-slate-100 text-center">Days</th><th className="p-5 border-b border-slate-100 text-center">Status</th><th className="p-5 border-b border-slate-100">HOD Remarks</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {history.length === 0 ? (
                    <tr><td colSpan={5} className="p-10 text-center text-slate-400 font-bold italic">No leaves submitted yet.</td></tr>
                  ) : (
                    history.map((record: any) => (
                      <tr key={record.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-5 font-mono text-xs text-slate-500">{parseLocalDate(record.createdAt).toLocaleString('en-GB')}</td>
                        <td className="p-5 font-bold text-slate-800">{parseLocalDate(record.startDate).toLocaleDateString('en-GB')}</td>
                        <td className="p-5 font-black text-[#006141] text-center">{record.numberOfDays || 1}</td>
                        <td className="p-5 text-center">
                          <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${record.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : record.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          {record.status} {record.isCompensated === 1 && " • COMP"}
                          </span>
                        </td>
                        <td className="p-5 text-slate-600 italic text-xs">
                          <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(record.remarks || "-") }} />
                          {record.status === 'pending' && (
                            <button onClick={() => handleCancelLeave(record.id)} className="mt-2 text-[10px] font-black uppercase bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg border border-rose-100 hover:bg-rose-100 transition-all block w-max">Withdraw Application</button>
                          )}
                        </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* --- HELP DESK & FEEDBACK SECTION --- */}
        <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-200 mt-8 relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                <span className="w-2 h-6 bg-purple-600 rounded-full"></span> IT Help Desk & Feedback
              </h3>
              <p className="text-sm text-slate-500 mt-1 font-medium">Experiencing a bug, leave calculation error, or have a suggestion? Contact the IT Admin directly.</p>
            </div>
            {ticketSuccess && (
              <div className="bg-green-100 text-green-800 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border border-green-300 flex items-center gap-2 animate-pulse">
                <span>✅</span> Your response has been submitted successfully and forwarded to the IT Admin.
              </div>
            )}
          </div>
          <form onSubmit={handleTicketSubmit} className="space-y-5 bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Subject / Issue Title</label>
                <input type="text" required value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder="e.g. Leave Balance is incorrect" className="w-full border-2 border-transparent bg-white rounded-xl p-3 text-sm font-bold focus:border-purple-600 outline-none transition-all shadow-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Attach Screenshot / Document (Max 10MB)</label>
                <input type="file" onChange={handleTicketFileChange} accept="image/*,.pdf,.doc,.docx" className="w-full border-2 border-dashed border-slate-300 bg-white rounded-xl p-2 text-sm font-bold focus:border-purple-600 outline-none transition-all cursor-pointer file:mr-4 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-black file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Detailed Message</label>
              <textarea required rows={4} value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} placeholder="Please describe the issue or suggestion in detail..." className="w-full border-2 border-transparent bg-white rounded-xl p-4 text-sm focus:border-purple-600 outline-none font-medium transition-all shadow-sm"></textarea>
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={isSubmittingTicket} className="bg-purple-600 text-white font-black py-3 px-8 rounded-xl hover:bg-purple-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-all shadow-lg uppercase tracking-widest flex items-center gap-2">
                {isSubmittingTicket ? "Uploading..." : "📨 Submit Ticket"}
              </button>
            </div>
          </form>
        </div>
        </>} {/* end leave tab */}
      </div>
    </div>
  );
}
