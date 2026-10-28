import { useState, useEffect, useMemo } from "react";
import MemoSystem from "./MemoSystem";
import { toast } from "react-toastify";
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis 
} from 'recharts';
import PrintableLeaveForm from "./PrintableLeaveForm";
import DOMPurify from 'dompurify';

const getDesignationSortWeight = (designation: unknown, role?: unknown) => {
  const normalized = String(designation || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normalizedRole = String(role || '').toLowerCase();

  if (/\bassociate\s+professor\b/.test(normalized)) return 2;
  if (/\bassistant\s+professor\b/.test(normalized)) return 3;
  if (/\bprofessor\b/.test(normalized)) return 1;
  if (/\blecturer\b/.test(normalized)) return 4;
  // Support common variants used in staff records (I.T. Manager, Manager IT, etc.).
  if (/\b(it|i\s+t|information\s+technology)\s+manager\b|\bmanager\s+(it|i\s+t)\b/.test(normalized)) return 5;
  if (/\b(jr|junior)\s+data\s+entry\s+operator\b|\bdeo\b|\bdata\s+entry\s+operator\b/.test(normalized)) return 6;
  if (/\bstore\s*keeper\b/.test(normalized)) return 7;
  if (/\bhelper\b.*\b(technician|tech)\b/.test(normalized)) return 11;
  if (/\btechnician\b/.test(normalized)) return 8;
  if (/\bcomputer\s+attendant\b/.test(normalized)) return 9;
  if (/\bmistry\b/.test(normalized)) return 10;
  if (/\blab\s+attendant\b/.test(normalized)) return 12;
  if (/\bnaib\s+qas?id\b/.test(normalized)) return 13;
  return 14;
};

const comparePersonnelNumbers = (left: unknown, right: unknown) => {
  const a = String(left ?? '').trim();
  const b = String(right ?? '').trim();
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const aDigits = a.match(/\d+/g)?.join('');
  const bDigits = b.match(/\d+/g)?.join('');
  if (aDigits && bDigits) {
    const aNumber = Number(aDigits);
    const bNumber = Number(bDigits);
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber) && aNumber !== bNumber) return aNumber - bNumber;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

const compareStaffOrder = (a: any, b: any) =>
  getDesignationSortWeight(a.designation, a.role) - getDesignationSortWeight(b.designation, b.role) ||
  comparePersonnelNumbers(a.persNo, b.persNo) ||
  String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });

// SECURITY/BUG FIX: Timezone-proof Date Parsing
const parseLocalDate = (dateString: string) => {
  if (!dateString) return new Date();
  const str = String(dateString); // Force string to prevent .split() crash on Date objects
  const parts = str.split('T')[0].split('-');
  if (parts.length < 3) return new Date();
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
};

const isWeekend = (dateString: string) => {
  if (!dateString) return false;
  const day = parseLocalDate(dateString).getDay();
  return day === 0 || day === 6; 
};

export default function HodDashboard() {
  const [viewMode, setViewMode] = useState<'list' | 'individual' | 'bulk' | 'iso-print' | 'compact-report' | 'admin-panel' | 'apply-leave' | 'my-leaves' | 'print-attendance' | 'memo'>('list');
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [holidays, setHolidays] = useState<any[]>([]);
  
  const [employeeRecord, setEmployeeRecord] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<any[]>([]);
  const [bulkReportData, setBulkReportData] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [remarks, setRemarks] = useState<{ [key: string]: string }>({});

  const [selectedIsoLeaves, setSelectedIsoLeaves] = useState<any[]>([]);
  const [selectedIndividualLeaves, setSelectedIndividualLeaves] = useState<number[]>([]);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // ATTENDANCE SHEET STATES
  const [attendanceMonth, setAttendanceMonth] = useState(new Date().toISOString().slice(0,7));
  const [attendanceType, setAttendanceType] = useState<'faculty'|'staff'>('faculty');
  const [attendanceData, setAttendanceData] = useState<any[]>([]);

  // SECURITY UPGRADE: Check both storages for smooth routing
  const hodName = sessionStorage.getItem('userName') || localStorage.getItem('userName') || "HOD";
  const userRole = (sessionStorage.getItem('userRole') || localStorage.getItem('userRole') || "employee").toLowerCase();
  const username = sessionStorage.getItem('username') || localStorage.getItem('username') || "";
  const token = sessionStorage.getItem('token') || "";

  const [newUser, setNewUser] = useState({
    name: '', 
    username: '', 
    password: '', 
    role: 'employee', 
    designation: '', 
    persNo: '', 
    bps: ''
  });

  const [applyStartDate, setApplyStartDate] = useState("");
  const [applyEndDate, setApplyEndDate] = useState("");
  const [applyDays, setApplyDays] = useState(0);
  const [applyReason, setApplyReason] = useState("");
  const [isSandwich, setIsSandwich] = useState(false);
  const [overlappingHolidays, setOverlappingHolidays] = useState<number>(0);
  
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [myBalance, setMyBalance] = useState(0);

  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");

  // NOTIFICATION & TICKET STATES
  const [notifications, setNotifications] = useState<{count: number, messages: string[]}>({ count: 0, messages: [] });
  const [showNotifications, setShowNotifications] = useState(false);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);

  // --- PROFILE SYSTEM STATES ---
  const [userData, setUserData] = useState<any>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false); // Locked/Unlock state
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [profileRequests, setProfileRequests] = useState<any[]>([]);
  const [profileEdit, setProfileEdit] = useState({
    name: '', designation: '', persNo: '', bps: '', phone: '', email: '', profilePicBase64: ''
  });

  // --- MULTI-LEVEL APPROVAL STATES ---
  const [supervisors, setSupervisors] = useState<any[]>([]);

  // BUG FIX: Clean redirect using replace to completely break the infinite loading loop
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

  const getHeaders = () => ({ 
    'Authorization': `Bearer ${token}`, 
    'Content-Type': 'application/json' 
  });

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`/api/notifications?_t=${Date.now()}`, { headers: getHeaders() });
      const data = await res.json();
      setNotifications(data);
    } catch (err) {
      console.error("Failed to load notifications");
    }
  };

  const fetchSupportTickets = async () => {
    if (userRole !== 'admin') return;
    try {
      const res = await fetch(`/api/admin/support?_t=${Date.now()}`, { headers: getHeaders() });
      const data = await res.json();
      setSupportTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load tickets");
    }
  };

  // Fetch Profile Update Requests (Admin Only)
  const fetchProfileRequests = async () => {
    if (userRole !== 'admin') return;
    try {
      const res = await fetch(`/api/admin/profile-requests?_t=${Date.now()}`, { headers: getHeaders() });
      const data = await res.json();
      setProfileRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load profile requests");
    }
  };

  useEffect(() => {
    fetchPendingLeaves();
    fetchEmployees();
    fetchMyLeaves();
    fetchUserDetails();
    fetchHolidays();
    fetchNotifications();
    fetchSupportTickets();
    fetchProfileRequests();
  }, []);

  const fetchHolidays = async () => {
    try {
      const res = await fetch(`/api/admin/holidays?_t=${Date.now()}`, { headers: getHeaders() });
      const data = await res.json();
      setHolidays(Array.isArray(data) ? data : []);
    } catch (err) { console.error(err); }
  };

  const fetchUserDetails = async () => {
    try {
      const res = await fetch(`/api/user-details?username=${username}&_t=${Date.now()}`, { headers: getHeaders() });
      const data = await res.json();
      if (data && !data.error) {
        setMyBalance(data.balance || 0);
        setUserData(data);
        // Pre-fill profile editor with current data
        setProfileEdit({
          name: data.name || '',
          designation: data.designation || '',
          persNo: data.persNo || '',
          bps: data.bps || '',
          phone: data.phone || '',
          email: data.email || '',
          profilePicBase64: data.profilePic || ''
        });
      }
    } catch (err) { console.error(err); }
  };

  const fetchPendingLeaves = async () => {
    try {
      const res = await fetch(`/api/admin/pending-leaves?_t=${Date.now()}`, { headers: getHeaders() });
      const data = await res.json();
      setPendingLeaves(Array.isArray(data) ? data : []);
    } catch (error) { toast.error("Failed to fetch leaves"); }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch(`/api/admin/employees-detailed?_t=${Date.now()}`, { headers: getHeaders() });
      const data = await res.json();
      setEmployees(Array.isArray(data) ? data : []);
    } catch (error) { toast.error("Failed to fetch employees"); }
  };

  const fetchMyLeaves = async () => {
    try {
      const res = await fetch(`/api/my-leaves?username=${username}&_t=${Date.now()}`, { headers: getHeaders() });
      const data = await res.json();
      setMyLeaves(Array.isArray(data) ? data : []);
    } catch (error) { toast.error("Failed to fetch history"); }
  };

  const handleCancelLeave = async (id: number) => {
    if (!window.confirm("Are you sure you want to withdraw this pending leave request?")) return;
    try {
      const res = await fetch(`/api/my-leaves/${id}`, { 
        method: 'DELETE', 
        headers: getHeaders() 
      });
      
      const data = await res.json();
      
      if (res.ok) {
        toast.success("Leave application withdrawn successfully.");
        setMyLeaves(prev => prev.filter(l => l.id !== id));
        setPendingLeaves(prev => prev.filter(l => l.id !== id));
        fetchMyLeaves();
        fetchPendingLeaves();
        fetchEmployees();
        fetchNotifications();
      } else {
        toast.error(`Error: ${data.error || "Could not withdraw leave."}`);
      }
    } catch (err) {
      toast.error("Server connection error during withdrawal.");
    }
  };

  const { chartData, currentMonthActive, enrichedEmployees, topAbsentees } = useMemo(() => {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const statusCounts = { pending: pendingLeaves.length, approved: 0, rejected: 0 };
    let monthActiveCount = 0;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTrend = months.map(m => ({ month: m, leaves: 0 }));

    const enriched = employees.map((emp: any) => {
      let spells = 0;
      let totalDaysThisYear = 0;

      if (emp.leaves && Array.isArray(emp.leaves)) {
        emp.leaves.forEach((l: any) => {
          if (l.status === 'approved') statusCounts.approved++;
          if (l.status === 'rejected') statusCounts.rejected++;
          
          const d = parseLocalDate(l.startDate);
          
          if (l.status === 'approved' && !l.isCompensated && d.getFullYear() === curYear) {
            const daysTaken = Number(l.numberOfDays) || 1;
            spells += 1; 
            totalDaysThisYear += daysTaken;
            monthlyTrend[d.getMonth()].leaves += daysTaken;
            if (d.getMonth() === curMonth) { monthActiveCount += daysTaken; }
          }
        });
      }
      const bradfordScore = (spells * spells) * totalDaysThisYear;
      return { ...emp, bradfordScore, totalDaysThisYear };
    });

    const totalLeaves = statusCounts.pending + statusCounts.approved + statusCounts.rejected;
    const pieData = totalLeaves === 0 
      ? [{ name: 'No Data Yet', value: 1, color: '#e2e8f0' }] 
      : [
          { name: 'Pending', value: statusCounts.pending, color: '#f59e0b' },
          { name: 'Approved', value: statusCounts.approved, color: '#10b981' }, 
          { name: 'Rejected', value: statusCounts.rejected, color: '#ef4444' }, 
        ].filter(d => d.value > 0);

    const desMap: any = {};
    employees.forEach((emp: any) => {
      const des = emp.designation || "Other";
      desMap[des] = (desMap[des] || 0) + 1;
    });

    const barData = Object.keys(desMap)
      .map(key => ({ name: key, count: desMap[key] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // ADVANCED METRICS: Top Absentees
    const topAbs = [...enriched].sort((a, b) => b.totalDaysThisYear - a.totalDaysThisYear).slice(0, 5);

    return { 
      chartData: { pieData, barData, monthlyTrend }, 
      currentMonthActive: monthActiveCount, 
      enrichedEmployees: enriched,
      topAbsentees: topAbs
    };
  }, [employees, pendingLeaves]);

  const handleAction = async (id: number, status: string, isCompensated: boolean = false) => {
    const remarkText = remarks[id] || "";
    try {
      const response = await fetch(`/api/admin/leave-action/${id}`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ 
          status, 
          remarks: remarkText, 
          isCompensated, 
          actionBy: hodName, 
          role: userRole 
        })
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(isCompensated ? `Leave approved as Comp-Off!` : `Leave ${status} successfully!`);
        fetchPendingLeaves(); 
        fetchEmployees();
        fetchNotifications(); 
      } else { 
        toast.error(data.error || "Error processing action."); 
      }
    } catch (error) { 
      toast.error("Network error."); 
    }
  };

  // --- MULTI-LEVEL APPROVAL: Fetch supervisors when admin panel opens ---
  useEffect(() => {
    if (viewMode === 'admin-panel') {
      fetch("/api/supervisors", { headers: getHeaders() })
        .then(res => res.json())
        .then(data => setSupervisors(Array.isArray(data) ? data : []))
        .catch(() => toast.error("Could not load supervisors list."));
    }
  }, [viewMode]);

  // --- MULTI-LEVEL APPROVAL: Assign supervisor to employee ---
  const handleSupervisorChange = async (employeeId: number, supervisorId: string) => {
    try {
      const res = await fetch(`/api/admin/users/${employeeId}/assign-supervisor`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ supervisor_id: supervisorId ? parseInt(supervisorId) : null })
      });
      if (res.ok) {
        toast.success("Reporting hierarchy updated!");
        fetchEmployees();
      } else {
        toast.error("Failed to update supervisor assignment.");
      }
    } catch (err) {
      toast.error("Network error updating hierarchy.");
    }
  };

  // --- MULTI-LEVEL APPROVAL: Supervisor Recommend / Reject action ---
  const handleSupervisorDecision = async (leaveId: number, choice: 'recommend' | 'reject') => {
    const confirmMsg = choice === 'recommend'
      ? "Forward this leave to the HOD for final approval?"
      : "Reject this leave at your level? The employee will be notified.";
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await fetch(`/api/admin/leave-action/${leaveId}`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          status: choice === 'recommend' ? 'recommend' : 'rejected_by_supervisor',
          actionBy: hodName,
          role: userRole
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(choice === 'recommend' ? "✅ Forwarded to HOD!" : "❌ Leave rejected at supervisor level.");
        fetchPendingLeaves();
        fetchNotifications();
      } else {
        toast.error(data.error || "Action failed.");
      }
    } catch (err) {
      toast.error("Network error during supervisor action.");
    }
  };

  const calculateApplyDays = (start: string, end: string) => {
    if (start && end) {
      const d1 = parseLocalDate(start);
      const d2 = parseLocalDate(end);
      if (d2 < d1) { 
        setApplyDays(0); 
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
      setApplyDays(finalChargedDays > 0 ? finalChargedDays : 0);
      
      // SMART SANDWICH DETECTOR
      const startDOW = d1.getDay();
      const endDOW = d2.getDay();
      const isStartWeekday = startDOW !== 0 && startDOW !== 6;
      const isEndWeekday = endDOW !== 0 && endDOW !== 6;
      
      setIsSandwich(weekendFound && isStartWeekday && isEndWeekday && diffDays >= 3);
      setOverlappingHolidays(holidaysFound);
    } else {
      setApplyDays(0); 
      setIsSandwich(false); 
      setOverlappingHolidays(0);
    }
  };

  const handleStartDateChange = (e: any) => { 
    setApplyStartDate(e.target.value); 
    calculateApplyDays(e.target.value, applyEndDate); 
  };
  
  const handleEndDateChange = (e: any) => { 
    setApplyEndDate(e.target.value); 
    calculateApplyDays(applyStartDate, e.target.value); 
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (applyDays <= 0 && overlappingHolidays === 0) { 
      toast.error("Invalid date range."); 
      return; 
    }
    
    const selectedDateStr = applyStartDate.split('T')[0];
    const holidayMatch = holidays.find(h => h.date.split('T')[0] === selectedDateStr);

    if (holidayMatch) {
      const proceed = window.confirm(`⚠️ HOLIDAY ALERT: ${selectedDateStr} is "${holidayMatch.name}". \n\nNormally, you don't need to apply for leave on a holiday.\n\nDid you work on this day and wish to submit this for Compensation?`);
      if (!proceed) return;
    }

    try {
      const response = await fetch('/api/submit-leave', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ 
          username: username, 
          startDate: applyStartDate, 
          endDate: applyEndDate, 
          numberOfDays: applyDays, 
          reason: applyReason 
        })
      });
      
      const data = await response.json();

      if (response.ok) {
        toast.success("Leave successfully recorded!");
        setApplyStartDate(""); 
        setApplyEndDate(""); 
        setApplyDays(0); 
        setIsSandwich(false); 
        setOverlappingHolidays(0); 
        setApplyReason("");
        fetchMyLeaves(); 
        setViewMode('my-leaves');
        fetchNotifications(); 
      } else { 
        toast.error(`⚠️ ${data.error || "Failed to submit."}`); 
      }
    } catch (err) { 
      toast.error("Server connection failed."); 
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/holidays', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ 
          name: newHolidayName, 
          date: newHolidayDate, 
          actionBy: hodName, 
          roleCheck: userRole 
        })
      });
      if (res.ok) {
        toast.success("Holiday added to system calendar.");
        setNewHolidayName(""); 
        setNewHolidayDate("");
        fetchHolidays();
      } else { 
        toast.error("Failed to add holiday."); 
      }
    } catch (e) { 
      toast.error("Network Error."); 
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/holidays/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ actionBy: hodName, roleCheck: userRole })
      });
      if (res.ok) { 
        toast.success("Holiday removed."); 
        fetchHolidays(); 
      }
    } catch (e) { 
      toast.error("Network Error."); 
    }
  };

  const handleYearEndReset = async () => {
    const confirmReset = window.confirm("⚠️ WARNING: Are you sure you want to reset ALL staff balances back to 25 days? \n\nThis is usually only done on January 1st. This action cannot be undone!");
    if (confirmReset) {
      try {
        const res = await fetch('/api/admin/reset-yearly-quota', { 
          method: 'POST', 
          headers: getHeaders(), 
          body: JSON.stringify({ actionBy: hodName, role: userRole }) 
        });
        const data = await res.json();
        if (res.ok) { 
          toast.success(data.message); 
          fetchEmployees(); 
        } else { 
          toast.error(data.error); 
        }
      } catch (err) { 
        toast.error("Failed to reset database."); 
      }
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newUser.password.length < 12) {
      toast.error("Initial password must be at least 12 characters long.");
      return;
    }
    try {
      const res = await fetch(`/api/admin/users`, { 
        method: 'POST', 
        headers: getHeaders(), 
        body: JSON.stringify({ ...newUser, actionBy: hodName, roleCheck: userRole }) 
      });
      const data = await res.json();
      if (res.ok) { 
        toast.success("User created!"); 
        setNewUser({ 
          name: '', 
          username: '', 
          password: '', 
          role: 'employee', 
          designation: '', 
          persNo: '', 
          bps: '' 
        }); 
        fetchEmployees(); 
      } else { 
        toast.error(`⚠️ ${data.error || "Failed to create user."}`); 
      }
    } catch (error) { 
      toast.error("Network error."); 
    }
  };

  const handleUpdateBalance = async (id: number) => {
    const newBalance = window.prompt("Enter new balance:");
    if (newBalance === null || isNaN(Number(newBalance)) || newBalance === "") return;
    try {
      const res = await fetch(`/api/admin/users/${id}/balance`, { 
        method: 'PUT', 
        headers: getHeaders(), 
        body: JSON.stringify({ balance: Number(newBalance), actionBy: hodName, roleCheck: userRole }) 
      });
      if (res.ok) { 
        toast.success("Balance updated!"); 
        fetchEmployees(); 
      } else { 
        toast.error("Failed."); 
      }
    } catch (error) { 
      toast.error("Network error."); 
    }
  };

  const handleAdminResetPassword = async (id: number, empName: string) => {
    const tempPassword = window.prompt(`🔒 SECURITY OVERRIDE:\nEnter a temporary password for ${empName}:\n(e.g., Ned@12345678)`);
    if (!tempPassword) return;
    
    if (tempPassword.length < 12) {
      toast.error("Password must be at least 12 characters long.");
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          tempPassword,
          actionBy: hodName
        })
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`Success: password reset for ${empName}. Give the temporary password to the user through a private channel. They must change it after signing in.`);
        fetchEmployees();
      } else {
        toast.error(data.error || "Password reset failed.");
      }
    } catch (err) {
      toast.error("Network error during password reset override.");
    }
  };

  const handleDeleteUser = async (id: number) => {
    if (!window.confirm("⚠️ DANGER: Delete user forever?")) return;
    try {
      const res = await fetch(`/api/admin/users/${id}`, { 
        method: 'DELETE', 
        headers: getHeaders(), 
        body: JSON.stringify({ actionBy: hodName, roleCheck: userRole }) 
      });
      if (res.ok) { 
        toast.success("User deleted."); 
        fetchEmployees(); 
      } else { 
        toast.error("Failed."); 
      }
    } catch (error) { 
      toast.error("Network error."); 
    }
  };
  
  const handleDelegateAuthority = async (id: number, currentRole: string) => {
    const isDelegating = currentRole !== 'hod';
    if (!window.confirm(`Are you sure you want to ${isDelegating ? 'GRANT' : 'REVOKE'} Acting HOD privileges for this user?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${id}/delegate`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ isDelegating: isDelegating, actionBy: hodName, roleCheck: userRole })
      });
      if (res.ok) {
        toast.success(`Authority ${isDelegating ? 'granted' : 'revoked'} successfully!`);
        fetchEmployees();
      }
    } catch (error) { 
      toast.error("Delegation failed."); 
    }
  };

  // FUTURE-PROOF: Toggle any user as a supervisor via Admin UI
  const handleToggleSupervisor = async (id: number, currentlyIsSupervisor: number) => {
    const action = currentlyIsSupervisor ? 'remove from' : 'add to';
    if (!window.confirm(`Are you sure you want to ${action} the supervisor/incharge list?\n\nThis controls who appears in the "Reports To" dropdown for staff assignments.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${id}/toggle-supervisor`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ is_supervisor: currentlyIsSupervisor ? 0 : 1 })
      });
      if (res.ok) {
        toast.success(currentlyIsSupervisor ? 'Removed from supervisor list.' : 'Added to supervisor list! They now appear in staff assignment dropdowns.');
        fetchEmployees();
      } else {
        toast.error('Failed to update supervisor status.');
      }
    } catch (err) {
      toast.error('Network error.');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(sortedAndFilteredEmployees.map(emp => emp.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: any) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleEmployeeSelect = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/admin/employee-records/${id}`, { headers: getHeaders() });
      const data = await res.json();
      setEmployeeRecord({ ...data, name });
      setSelectedIndividualLeaves([]); 
      setViewMode('individual');
    } catch (error) { 
      toast.error("Failed to fetch employee record."); 
    }
  };

  // ATTENDANCE SHEET LOGIC WITH SMART FILTERING & SCALING
  const handlePrintAttendance = async (type: 'faculty' | 'staff') => {
    const targetEmployees = enrichedEmployees.filter((emp: any) => {
      const lowerDesig = (emp.designation || "").toLowerCase();
      
      // Faculty is identified by academic designations
      const isFac = lowerDesig.includes('professor') || 
                    lowerDesig.includes('chairman') || 
                    lowerDesig.includes('hod') || 
                    lowerDesig.includes('lecturer');
                    
      return type === 'faculty' ? isFac : !isFac;
    });

    if (targetEmployees.length === 0) {
      toast.info(`No ${type} members found.`);
      return;
    }

    setAttendanceType(type);
    setAttendanceData(targetEmployees);
    setViewMode('print-attendance');
  };

  const getDayStatus = (emp: any, dayNum: number, yearNum: number, monthNum: number) => {
    const dateStr = `${yearNum}-${String(monthNum + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const dateObj = new Date(yearNum, monthNum, dayNum);
    const dayOfWeek = dateObj.getDay();

    // 1. Check Approved Casual Leaves
    const isCL = emp.leaves?.some((l: any) => {
      if (l.status !== 'approved' || l.isCompensated) return false;
      const lStart = parseLocalDate(l.startDate);
      let lEnd = new Date(lStart);
      if (l.endDate) {
        lEnd = parseLocalDate(l.endDate);
      } else {
        lEnd.setDate(lStart.getDate() + ((Number(l.numberOfDays) || 1) - 1));
      }
      return dateObj >= lStart && dateObj <= lEnd;
    });
    if (isCL) return { isStatus: true, text: 'CASUAL LEAVE' };

    // 2. Check Public Holidays
    const hol = holidays.find(h => h.date.split('T')[0] === dateStr);
    if (hol) return { isStatus: true, text: hol.name };

    // 3. Check Weekends
    if (dayOfWeek === 0) return { isStatus: true, text: 'SUNDAY' };
    if (dayOfWeek === 6) return { isStatus: true, text: 'SATURDAY' };

    return { isStatus: false, text: '' };
  };

  // FULLY FIXED SYNTAX: The truncating issue in the previous prompt broke this JSX.
  const renderAttendanceTableBlock = (startDay: number, endDay: number, emp: any, yearNum: number, monthNum: number, daysInMonth: number) => {
    const rows = [];
    for (let i = startDay; i <= endDay; i++) {
      if (i > daysInMonth) {
        rows.push(
          <tr key={i}>
            <td className="border-r border-b border-black text-center w-[15%] text-[13px] font-bold">&nbsp;</td>
            <td className="border-r border-b border-black w-[21.25%]"></td>
            <td className="border-r border-b border-black w-[21.25%]"></td>
            <td className="border-r border-b border-black w-[21.25%]"></td>
            <td className="border-b border-black w-[21.25%]"></td>
          </tr>
        );
        continue;
      }

      const st = getDayStatus(emp, i, yearNum, monthNum);
      const suffix = (i === 1 || i === 21 || i === 31) ? 'st' : (i === 2 || i === 22) ? 'nd' : (i === 3 || i === 23) ? 'rd' : 'th';

      if (st.isStatus) {
        rows.push(
          <tr key={i}>
            <td className="border-r border-b border-black text-center w-[15%] text-[13px] font-bold">{i}<sup>{suffix}</sup></td>
            <td colSpan={4} className="border-b border-black text-center text-[13px] tracking-widest font-black text-gray-500 uppercase bg-gray-100/60 leading-tight">
              {st.text}
            </td>
          </tr>
        );
      } else {
        rows.push(
          <tr key={i}>
            <td className="border-r border-b border-black text-center w-[15%] text-[13px] font-bold">{i}<sup>{suffix}</sup></td>
            <td className="border-r border-b border-black w-[21.25%]"></td>
            <td className="border-r border-b border-black w-[21.25%]"></td>
            <td className="border-r border-b border-black w-[21.25%]"></td>
            <td className="border-b border-black w-[21.25%]"></td>
          </tr>
        );
      }
    }
    
    return (
      <table className="w-full h-full border-collapse table-fixed text-black">
        <thead>
          <tr className="bg-gray-100/40">
            <th className="border-r border-b border-black font-bold text-[13px] leading-tight h-8 w-[15%]">Date</th>
            <th className="border-r border-b border-black font-bold text-[13px] leading-tight px-1 w-[21.25%]">Time<br/>In</th>
            <th className="border-r border-b border-black font-bold text-[13px] leading-tight px-1 w-[21.25%]">Initial</th>
            <th className="border-r border-b border-black font-bold text-[13px] leading-tight px-1 w-[21.25%]">Time<br/>Out</th>
            <th className="border-b border-black font-bold text-[13px] leading-tight px-1 w-[21.25%]">Initial</th>
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    );
  };

  // FULLY OPTIMIZED: Synchronous calculation mapped directly from local memory.
  const handleGenerateReport = async (targetView: 'bulk' | 'compact-report') => {
    let idsToFetch = selectedIds;
    if (idsToFetch.length === 0) {
      idsToFetch = sortedAndFilteredEmployees.map((emp: any) => emp.id);
      setSelectedIds(idsToFetch);
      toast.info("Generating report for ALL employees!");
    }
    
    setIsGenerating(true);
    
    setTimeout(() => {
      try {
        const enriched = (Array.isArray(employees) ? employees : [])
          .filter((emp: any) => idsToFetch.includes(emp.id))
          .map((emp: any) => ({
            ...emp,
            leaves: Array.isArray(emp.leaves) ? emp.leaves : [],
            balance: emp.balance || { remaining: 25, used: 0 }
          }));

        enriched.sort((a: any, b: any) => {
          const bpsA = parseInt(a.bps) || 0;
          const bpsB = parseInt(b.bps) || 0;
          if (bpsA !== bpsB) return bpsB - bpsA; 
          return compareStaffOrder(a, b);
        });
        
        setBulkReportData(enriched); 
        setViewMode(targetView);
      } catch (err) { 
        toast.error("Crash prevented: Failed to map data."); 
      } finally {
        setIsGenerating(false);
      }
    }, 50);
  };

  const handlePrint = () => window.print();

  const handleSelectIndividualLeave = (id: number) => {
    if (selectedIndividualLeaves.includes(id)) { 
      setSelectedIndividualLeaves(selectedIndividualLeaves.filter(i => i !== id)); 
    } else { 
      setSelectedIndividualLeaves([...selectedIndividualLeaves, id]); 
    }
  };

  const handlePrintSelectedIso = async (leavesToPrint: any[], employeeInfo: any) => {
    try {
      const today = new Date().toLocaleDateString('en-GB'); 
      const leaveYear = new Date().getFullYear();

      const mappedIsoForms = leavesToPrint.map(leaveRecord => {
        const sDateStr = parseLocalDate(leaveRecord.date || leaveRecord.startDate).toLocaleDateString('en-GB');
        let eDateStr = sDateStr;
        
        if (leaveRecord.endDate) {
           eDateStr = parseLocalDate(leaveRecord.endDate).toLocaleDateString('en-GB');
        } else if (leaveRecord.numberOfDays > 1) {
            const tempDate = parseLocalDate(leaveRecord.date || leaveRecord.startDate);
            tempDate.setDate(tempDate.getDate() + (leaveRecord.numberOfDays - 1));
            eDateStr = tempDate.toLocaleDateString('en-GB');
        }

        let prevLeaves = 0;
        if (employeeRecord && employeeRecord.leaves) {
          prevLeaves = employeeRecord.leaves.reduce((total: number, l: any) => {
            const d = parseLocalDate(l.startDate);
            if (l.status === 'approved' && d.getFullYear() === leaveYear && d < parseLocalDate(leaveRecord.date || leaveRecord.startDate) && !l.isCompensated) { 
              return total + (Number(l.numberOfDays) || 1); 
            }
            return total;
          }, 0);
        }

        return {
          applicantName: leaveRecord.name || employeeInfo?.name,
          designation: employeeInfo?.designation || "Staff",
          department: "Engineering",
          startDate: sDateStr,
          endDate: eDateStr,
          numberOfDays: leaveRecord.numberOfDays || 1,
          reason: leaveRecord.reason,
          applicantSignatureName: leaveRecord.name || employeeInfo?.name,
          submissionDate: parseLocalDate(leaveRecord.createdAt || new Date().toISOString()).toLocaleDateString('en-GB'),
          hodName: hodName,
          hodStatus: leaveRecord.status || 'pending',
          hodActionDate: today,
          previouslyAvailed: prevLeaves,
          isCompensated: leaveRecord.isCompensated || false,
          // MULTI-LEVEL APPROVAL: Pass supervisor audit trail to ISO form
          supervisor_approved_by: leaveRecord.supervisor_approved_by || null,
          supervisor_approved_at: leaveRecord.supervisor_approved_at || null,
        };
      });
      
      setSelectedIsoLeaves(mappedIsoForms);
      setViewMode('iso-print');
    } catch (error) { 
      toast.error("Error generating document."); 
    }
  };

  const handlePrintMyLeaves = async (selectedLeavesToPrint: any[]) => {
    try {
      const today = new Date().toLocaleDateString('en-GB'); 

      const mappedIsoForms = selectedLeavesToPrint.map(leaveRecord => {
        const sDateStr = parseLocalDate(leaveRecord.date || leaveRecord.startDate).toLocaleDateString('en-GB');
        let eDateStr = sDateStr;
        
        if (leaveRecord.endDate) {
           eDateStr = parseLocalDate(leaveRecord.endDate).toLocaleDateString('en-GB');
        } else if (leaveRecord.numberOfDays > 1) {
            const tempDate = parseLocalDate(leaveRecord.date || leaveRecord.startDate);
            tempDate.setDate(tempDate.getDate() + (leaveRecord.numberOfDays - 1));
            eDateStr = tempDate.toLocaleDateString('en-GB');
        }

        return {
          applicantName: hodName,
          designation: userRole.toUpperCase(),
          department: "Engineering",
          startDate: sDateStr,
          endDate: eDateStr,
          numberOfDays: leaveRecord.numberOfDays || 1,
          reason: leaveRecord.reason,
          applicantSignatureName: hodName,
          submissionDate: parseLocalDate(leaveRecord.createdAt || new Date().toISOString()).toLocaleDateString('en-GB'),
          hodName: userRole === 'hod' ? "DEAN" : "Chairman / Head of Department", 
          hodStatus: leaveRecord.status || 'pending',
          hodActionDate: today,
          previouslyAvailed: 25 - myBalance, 
          isCompensated: leaveRecord.isCompensated || false,
          isHODApplication: userRole === 'hod' 
        };
      });
      
      setSelectedIsoLeaves(mappedIsoForms);
      setViewMode('iso-print');
    } catch (error) { 
      toast.error("Error generating document."); 
    }
  };

  const sortedAndFilteredEmployees = [...enrichedEmployees].filter((emp: any) => {
    const searchLower = (searchTerm || "").toLowerCase();
    return (emp.name || "").toLowerCase().includes(searchLower) || (emp.designation || "").toLowerCase().includes(searchLower);
  }).sort(compareStaffOrder);

  const filterLeavesByDate = (leaves: any[]) => {
    if (!leaves || !Array.isArray(leaves)) return [];
    return leaves.filter((leave: any) => {
      if (!fromDate && !toDate) return true;
      const leaveDate = parseLocalDate(leave.startDate);
      let isValid = true;
      if (fromDate) {
        const fDate = parseLocalDate(fromDate);
        if (leaveDate < fDate) isValid = false;
      }
      if (toDate) {
        const tDate = parseLocalDate(toDate);
        if (leaveDate > tDate) isValid = false;
      }
      return isValid;
    });
  };

  // NATIVE EXCEL EXPORTER
  const handleExportExcel = () => {
    if (bulkReportData.length === 0) {
      toast.error("Please generate 'Compact Summary' first, then click Export.");
      return;
    }

    try {
      const filename = `CLMS_Compact_Summary_Report_${new Date().toISOString().slice(0, 10)}.xls`;
      
      let excelContent = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
          <meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8">
          <style>
            .title { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; text-align: center; }
            .header { font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; background-color: #006141; color: #ffffff; text-align: center; border: 0.5px solid #000000; }
            .data { font-family: Arial, sans-serif; font-size: 11px; border: 0.5px solid #cccccc; }
            .data-number { font-family: Arial, sans-serif; font-size: 11px; text-align: center; border: 0.5px solid #cccccc; }
            .data-bold { font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; border: 0.5px solid #cccccc; }
          </style>
        </head>
        <body>
          <table>
            <tr><td colspan="8" class="title"><b>EXAMPLE TECHNICAL UNIVERSITY</b></td></tr>
            <tr><td colspan="8" class="title">Department of Engineering</td></tr>
            <tr><td colspan="8" class="title">Casual Leave Management System (CLMS) - Compact Summary</td></tr>
            <tr><td colspan="8" style="text-align: center;">Report Generated: ${new Date().toLocaleString('en-GB')}</td></tr>
            <tr><td colspan="8"></td></tr>
            <tr>
              <td class="header"><b>Sr. No.</b></td>
              <td class="header"><b>Personnel No.</b></td>
              <td class="header"><b>Full Name</b></td>
              <td class="header"><b>Designation</b></td>
              <td class="header"><b>BPS</b></td>
              <td class="header"><b>Leaves Taken (Approved)</b></td>
              <td class="header"><b>LWP Days (Leave Without Pay)</b></td>
              <td class="header"><b>Remaining Balance</b></td>
            </tr>
      `;

      bulkReportData.forEach((emp, idx) => {
        const filteredLeaves = filterLeavesByDate(emp.leaves);
        const leavesTaken = filteredLeaves.reduce((acc: number, l: any) => 
          (l.status === 'approved' && !l.isCompensated) ? acc + (Number(l.numberOfDays) || 1) : acc, 0
        );
        const currentRemaining = typeof emp.balance?.remaining === 'number' 
          ? emp.balance.remaining 
          : (parseInt(emp.balance?.remaining) || 0);
        const lwpDays = currentRemaining < 0 ? Math.abs(currentRemaining) : 0;
        const officialRemaining = currentRemaining < 0 ? 0 : currentRemaining;

        excelContent += `
          <tr>
            <td class="data-number">${idx + 1}</td>
            <td class="data-number" style="mso-number-format:'\\@';">${emp.persNo || '-'}</td>
            <td class="data-bold">${emp.name}</td>
            <td class="data">${emp.designation}</td>
            <td class="data-number">${emp.bps || '-'}</td>
            <td class="data-number" style="color: #333333;">${leavesTaken}</td>
            <td class="data-number" style="color: #ef4444; font-weight: ${lwpDays > 0 ? 'bold' : 'normal'};">${lwpDays > 0 ? lwpDays : '-'}</td>
            <td class="data-number" style="color: #10b981; font-weight: bold;">${officialRemaining}</td>
          </tr>
        `;
      });

      excelContent += `
          </table>
        </body>
        </html>
      `;

      const blob = new Blob([excelContent], { type: "application/vnd.ms-excel;charset=utf-8" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Excel Report Exported successfully!");
    } catch (err) {
      toast.error("Export to Excel failed.");
    }
  };

  // NEW: Handle resolving support tickets
  const handleResolveTicket = async (id: number) => {
    if (!window.confirm("Mark this ticket as resolved? The user will be notified.")) return;
    try {
      const res = await fetch(`/api/admin/support/${id}/resolve`, {
        method: 'PUT',
        headers: getHeaders()
      });
      if (res.ok) {
        toast.success("Ticket marked as resolved!");
        fetchSupportTickets();
        fetchNotifications();
      } else {
        toast.error("Failed to resolve ticket.");
      }
    } catch (err) {
      toast.error("Network error resolving ticket.");
    }
  };

  const handleViewAttachment = async (id: number) => {
    try {
      const response = await fetch(`/api/admin/support/${id}/attachment`, { headers: getHeaders() });
      if (!response.ok) {
        toast.error("Could not retrieve attachment.");
        return;
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      toast.error("Network error retrieving attachment.");
    }
  };

  // --- HANDLE PROFILE SUBMISSION (FIXED: No Auto-Submit on Edit) ---
  const handleProfileSubmit = async () => {
    setIsSubmittingProfile(true);
    try {
      const response = await fetch('/api/profile-update', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ ...profileEdit, username })
      });
      if (response.ok) {
        toast.success("Profile update requested successfully! Pending IT Admin approval.");
        setShowProfile(false);
        setIsEditingProfile(false);
      } else {
        toast.error("Failed to submit profile update request.");
      }
    } catch (err) {
      toast.error("Network error.");
    }
    setIsSubmittingProfile(false);
  };

  // --- ADMIN APPROVE/REJECT PROFILE (FIXED: WITH REJECTION REASON PROMPT) ---
  const handleProfileRequestAction = async (id: number, action: 'approve' | 'reject') => {
    let rejectReason = "";
    
    if (action === 'reject') {
      const reason = window.prompt("Enter rejection reason (User will see this):");
      if (reason === null) return; // Action cancelled by admin
      rejectReason = reason;
    } else {
      if (!window.confirm("Are you sure you want to APPROVE this profile update?")) return;
    }

    try {
      const res = await fetch(`/api/admin/profile-requests/${id}/${action}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ rejectReason }) // Send the reason to the backend!
      });
      if (res.ok) {
        toast.success(`Profile update ${action}d successfully!`);
        fetchProfileRequests();
        fetchEmployees(); // refresh data
      } else {
        toast.error("Failed to process action.");
      }
    } catch (err) {
      toast.error("Network error.");
    }
  };

  const handleProfilePicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Profile picture must be less than 2MB.");
        return;
      }
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        setProfileEdit({ ...profileEdit, profilePicBase64: reader.result as string });
      };
    }
  };

  return (
    <>
      <style type="text/css">
        {`
          @media print {
            @page { 
              margin: 0; 
              size: A4 ${viewMode === 'print-attendance' ? 'landscape' : 'portrait'}; 
            }
            body, html { 
              background: white !important; margin: 0 !important; padding: 0 !important; 
              -webkit-print-color-adjust: exact; print-color-adjust: exact;
            }
            body * { visibility: hidden; }
            #printable-area, #printable-area * { visibility: visible; }
            #printable-area { 
              position: absolute !important; 
              left: 0 !important; 
              top: 0 !important; 
              width: 100% !important; 
              margin: 0 !important; 
              padding: 0 !important; 
            }
          }
        `}
      </style>

      {/* --- NEW: PROFILE MODAL WITH LOCKED/EDIT MODE --- */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-all overflow-y-auto pt-20 pb-10 print:hidden">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden relative">
            <div className="bg-[#006141] p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-widest flex items-center gap-2">
                <span>👤</span> My Profile Details
              </h3>
              <button onClick={() => { setShowProfile(false); setIsEditingProfile(false); }} className="text-white hover:text-red-300 font-bold text-3xl leading-none">&times;</button>
            </div>
            
            {/* BUG FIX: Changed from <form> to <div> to prevent auto-submit! */}
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
                  {isEditingProfile && (
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">Format: JPG, PNG, GIF<br/>Max Size: 2MB</p>
                  )}
                </div>

                <div className="flex-1 w-full space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Full Legal Name</label>
                    <input 
                      type="text" 
                      required 
                      disabled={!isEditingProfile}
                      value={profileEdit.name} 
                      onChange={e => setProfileEdit({...profileEdit, name: e.target.value})} 
                      className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all" 
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Designation</label>
                      <input 
                        type="text" 
                        required 
                        disabled={!isEditingProfile}
                        value={profileEdit.designation} 
                        onChange={e => setProfileEdit({...profileEdit, designation: e.target.value})} 
                        className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">BPS Grade</label>
                      <input 
                        type="text" 
                        disabled={!isEditingProfile}
                        value={profileEdit.bps} 
                        onChange={e => setProfileEdit({...profileEdit, bps: e.target.value})} 
                        className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Personal No.</label>
                  <input 
                    type="text" 
                    disabled={!isEditingProfile}
                    value={profileEdit.persNo} 
                    onChange={e => setProfileEdit({...profileEdit, persNo: e.target.value})} 
                    className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all font-mono" 
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Phone Number</label>
                  <input 
                    type="tel" 
                    disabled={!isEditingProfile}
                    value={profileEdit.phone} 
                    onChange={e => setProfileEdit({...profileEdit, phone: e.target.value})} 
                    className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all font-mono" 
                    placeholder="0300-1234567" 
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 ml-1">Email Address</label>
                  <input 
                    type="email" 
                    disabled={!isEditingProfile}
                    value={profileEdit.email} 
                    onChange={e => setProfileEdit({...profileEdit, email: e.target.value})} 
                    className="w-full border-2 border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-transparent rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all" 
                    placeholder="user@example.edu" 
                  />
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
                    <button type="button" onClick={() => setShowProfile(false)} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all uppercase tracking-wider text-sm">
                      Close
                    </button>
                    <button type="button" onClick={() => setIsEditingProfile(true)} className="px-8 py-3 rounded-xl font-black bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-md uppercase tracking-wider text-sm flex items-center gap-2">
                      ✏️ Edit Profile
                    </button>
                  </>
                ) : (
                  <>
                    <button 
                      type="button" 
                      onClick={() => {
                        // Reset to original data when cancelling
                        setProfileEdit({
                          name: userData.name || '', designation: userData.designation || '', persNo: userData.persNo || '', bps: userData.bps || '', phone: userData.phone || '', email: userData.email || '', profilePicBase64: userData.profilePic || ''
                        });
                        setIsEditingProfile(false);
                      }} 
                      className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all uppercase tracking-wider text-sm"
                    >
                      Cancel Edit
                    </button>
                    <button type="button" onClick={handleProfileSubmit} disabled={isSubmittingProfile} className="px-8 py-3 rounded-xl font-black bg-[#006141] text-white hover:bg-[#004d34] disabled:bg-slate-300 transition-all shadow-md uppercase tracking-wider text-sm flex items-center gap-2">
                      {isSubmittingProfile ? 'Transmitting...' : 'Submit for Approval'}
                    </button>
                  </>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

      <div className="w-full space-y-8 pb-20 bg-slate-50 min-h-screen p-4 md:p-8 print:p-0 print:m-0 print:space-y-0 print:min-h-0 print:pb-0 print:bg-white">
        
        <div className="print:hidden space-y-8">
          
          <header className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-[#006141] text-white p-6 md:p-8 rounded-3xl shadow-xl border-l-8 border-yellow-400 relative z-40 animate-fadeIn">
            <div className="flex items-center gap-4">
              <div className="bg-white p-3 rounded-2xl shadow-lg shadow-emerald-900/20">
                <img 
                  src="/logo.png" 
                  alt="University logo" 
                  className="h-12 w-12 object-contain grayscale" 
                />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">LEAVE MANAGEMENT</h1>
                <p className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-green-200 opacity-90 mt-1">
                  Department Admin Portal
                </p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
               <button
                 onClick={() => setViewMode('memo')}
                 className="bg-white text-[#006141] px-5 h-12 rounded-xl font-bold hover:bg-green-50 transition-all border border-white whitespace-nowrap"
               >
                 📝 Internal Memo
               </button>

               <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/20 hidden sm:block">
                 <p className="text-[10px] font-black text-green-200 uppercase leading-none mb-1">
                   Active Session
                 </p>
                 <p className="text-sm font-bold">
                   {hodName} 
                   <span className="ml-1 text-[10px] bg-yellow-400 text-[#006141] px-1.5 py-0.5 rounded font-black uppercase">
                     {userRole}
                   </span>
                 </p>
               </div>
               
               {(userRole === 'hod' || userRole === 'admin') && (
                 <>
                   <button 
                     onClick={() => setViewMode('apply-leave')} 
                     className="bg-amber-500 text-white px-5 h-12 rounded-xl font-bold hover:bg-amber-600 transition-all border border-amber-600 whitespace-nowrap"
                   >
                     📝 Apply CL
                   </button>
                   <button 
                     onClick={() => setViewMode('my-leaves')} 
                     className="bg-indigo-600 text-white px-5 h-12 rounded-xl font-bold hover:bg-indigo-700 transition-all border border-indigo-800 whitespace-nowrap"
                   >
                     📋 My History
                   </button>
                 </>
               )}

               {/* --- AVATAR PROFILE BUTTON --- */}
               <button 
                 onClick={() => { setShowProfile(true); setIsEditingProfile(false); }}
                 className="relative w-12 h-12 rounded-xl border border-white/20 overflow-hidden bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center shadow-sm"
                 title="My Profile"
               >
                 {userData?.profilePic ? (
                   <img src={userData.profilePic} alt="Profile" className="w-full h-full object-cover" />
                 ) : (
                   <span className="font-black text-white text-lg">{userData?.name?.charAt(0).toUpperCase() || '?'}</span>
                 )}
               </button>

               {/* NOTIFICATION BELL */}
               <div className="relative">
                 <button 
                   onClick={() => setShowNotifications(!showNotifications)}
                   className="relative p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all border border-white/20 flex items-center justify-center h-12 w-12"
                 >
                   <span className="text-2xl">🔔</span>
                   {notifications.count > 0 && (
                     <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-[#006141] shadow-md animate-pulse">
                       {notifications.count}
                     </span>
                   )}
                 </button>

                 {/* NOTIFICATION DROPDOWN */}
                 {showNotifications && (
                   <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50 transform origin-top-right transition-all">
                     <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                       <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Recent Activity</h4>
                       <span className="bg-blue-100 text-blue-800 text-[9px] font-black px-2 py-0.5 rounded uppercase">{notifications.count} New</span>
                     </div>
                     <div className="max-h-64 overflow-y-auto p-2 bg-white">
                       {notifications.messages.length === 0 ? (
                         <p className="text-slate-400 text-xs font-bold text-center p-6">No recent updates.</p>
                       ) : (
                         notifications.messages.map((msg, idx) => (
                           <div key={idx} className="p-4 bg-blue-50/50 hover:bg-blue-50 text-sm font-semibold text-slate-700 border-b border-slate-100 last:border-0 rounded-lg mb-1 flex items-start gap-3 transition-colors">
                             <span className="text-blue-500 mt-0.5">▪</span>
                             <span className="leading-tight">{msg}</span>
                           </div>
                         ))
                       )}
                     </div>
                   </div>
                 )}
               </div>
               
               <button 
                 onClick={handleLogout} 
                 className="bg-rose-500 text-white h-12 px-6 rounded-xl font-bold hover:bg-rose-600 transition-all shadow-md uppercase tracking-wider text-sm whitespace-nowrap"
               >
                 Logout Session
               </button>
            </div>
          </header>

          {/* VIEW MODE: LIST (Main Dashboard View) */}
          {viewMode === 'list' && (
            <>
              {/* DASHBOARD STATS */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10 font-sans">
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                    <p className="text-slate-500 font-bold uppercase text-xs tracking-wider">Total Staff</p>
                    <h4 className="text-4xl font-black text-slate-800 mt-1">{employees.length}</h4>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-orange-500 hover:shadow-md transition-shadow">
                    <p className="text-slate-500 font-bold uppercase text-xs tracking-wider">Awaiting Approval</p>
                    <h4 className="text-4xl font-black text-orange-600 mt-1">{pendingLeaves.length}</h4>
                  </div>
                  {/* BUG FIX: CLARIFIED LABEL SO "27 DAYS" MAKES SENSE */}
                  <div className="bg-[#006141] p-6 rounded-2xl shadow-sm text-white hover:shadow-md transition-shadow">
                    <p className="text-green-200 font-bold uppercase text-xs tracking-wider">Total Leaves This Month</p>
                    <h4 className="text-4xl font-black mt-1">
                      {currentMonthActive} <span className="text-lg font-normal opacity-60">Days</span>
                    </h4>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center">
                  <h3 className="font-bold text-slate-700 uppercase text-sm mb-4 w-full">Leave Status Distribution</h3>
                  <div className="w-full h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie 
                          data={chartData.pieData} 
                          innerRadius={60} 
                          outerRadius={80} 
                          paddingAngle={5} 
                          dataKey="value"
                        >
                          {chartData.pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any, name: any) => [`${value} Requests`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-4 mt-2">
                    {chartData.pieData.map(d => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
                        <span className="text-xs font-bold text-slate-600">{d.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="font-bold text-slate-700 uppercase text-sm mb-4">Staff Count by Designation</h3>
                  <div className="w-full h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.barData} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={100} fontSize={10} fontWeight="bold" />
                        <Tooltip />
                        <Bar dataKey="count" fill="#006141" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* MONTHLY TREND CHART & TOP ABSENTEES */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8 relative z-10 font-sans">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-slate-700 uppercase text-sm">
                      Monthly Absence Trend ({new Date().getFullYear()})
                    </h3>
                    <span className="bg-blue-100 text-blue-800 text-[10px] font-black px-2 py-1 rounded uppercase tracking-wider border border-blue-200 shadow-sm">
                      Department Analytics
                    </span>
                  </div>
                  <div className="w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.monthlyTrend}>
                        <XAxis dataKey="month" fontSize={12} fontWeight="bold" stroke="#94a3b8" />
                        <YAxis fontSize={12} stroke="#94a3b8" />
                        <Tooltip 
                          cursor={{ fill: '#f1f5f9' }} 
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                        />
                        <Bar dataKey="leaves" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Total Days Taken" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* ADVANCED METRICS: Top Absentees List */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 font-sans">
                  <h3 className="font-bold text-slate-700 uppercase text-sm mb-4 border-b pb-2">
                    Top Absentees (YTD)
                  </h3>
                  <div className="space-y-4 mt-4">
                    {topAbsentees.length > 0 ? topAbsentees.map((emp: any, idx: number) => (
                      <div key={emp.id} className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${idx === 0 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-slate-800 leading-tight">{emp.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{emp.designation}</p>
                          </div>
                        </div>
                        <span className="font-black text-rose-600 bg-rose-50 px-2 py-1 rounded text-xs border border-rose-100">
                          {emp.totalDaysThisYear} Days
                        </span>
                      </div>
                    )) : (
                      <p className="text-sm text-slate-400 italic text-center py-4 font-sans">No absences recorded yet.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* MONTHLY ATTENDANCE SHEET GENERATOR */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mt-8 relative z-10 font-sans">
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 uppercase text-lg flex items-center gap-2">
                    <span className="w-2 h-6 bg-purple-600 rounded-full"></span>
                    Print Attendance Sheets
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-1 font-sans">Auto-generates official grids with Weekends, Holidays, and CL pre-filled.</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                  <input 
                    type="month" 
                    value={attendanceMonth} 
                    onChange={e => setAttendanceMonth(e.target.value)} 
                    className="border border-slate-300 rounded-xl p-2.5 text-sm focus:ring-2 focus:ring-purple-600 outline-none font-bold text-slate-700 w-full sm:w-auto font-sans"
                  />
                  <button 
                    onClick={() => handlePrintAttendance('faculty')}
                    className="bg-purple-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:bg-purple-700 transition-all flex items-center justify-center gap-2 whitespace-nowrap w-full sm:w-auto"
                  >
                    🖨️ Faculty Sheets
                  </button>
                  <button 
                    onClick={() => handlePrintAttendance('staff')}
                    className="bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold shadow-md hover:bg-slate-900 transition-all flex items-center justify-center gap-2 whitespace-nowrap w-full sm:w-auto"
                  >
                    🖨️ Staff Sheets
                  </button>
                </div>
              </div>

              {/* PENDING LEAVES TABLE WITH ADVANCED SMART WARNINGS */}
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-slate-200 mt-8 relative z-10 font-sans">
                <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
                  <h3 className="font-bold text-slate-800 uppercase text-lg flex items-center gap-2">
                    <span className="w-2 h-6 bg-orange-500 rounded-full"></span>
                    Pending Leave Requests
                  </h3>
                  <span className="bg-orange-100 text-orange-700 font-bold px-3 py-1 rounded-full text-xs">
                    {pendingLeaves.length} Critical Actions
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-500 uppercase text-xs">
                      <tr>
                        <th className="p-4">Employee Name</th>
                        <th className="p-4">Leave Date</th>
                        <th className="p-4">Reason</th>
                        <th className="p-4 text-center">Days</th>
                        <th className="p-4">HOD Remarks</th>
                        <th className="p-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-xs md:text-sm">
                      {pendingLeaves.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400 italic font-sans">
                            Excellent! You are all caught up. No pending requests.
                          </td>
                        </tr>
                      ) : (
                        pendingLeaves.map((leave: any) => {
                          const empInfo = employees.find(e => e.name === leave.name);
                          const isWeekendLeave = isWeekend(leave.date); 
                          
                          const leaveDateStr = leave.date.split('T')[0];
                          const holiday = holidays.find(h => h.date.split('T')[0] === leaveDateStr);

                          // --- SMART WARNING 1: FREQUENT ABSENTEE (2-Day Accrual Limit Warning) ---
                          let leavesThisMonth = 0;
                          if (empInfo && empInfo.leaves && Array.isArray(empInfo.leaves)) {
                             const targetMonth = parseLocalDate(leave.date).getMonth();
                             const targetYear = parseLocalDate(leave.date).getFullYear();
                             empInfo.leaves.forEach((l: any) => {
                                if (l.status === 'approved' && !l.isCompensated) {
                                   const lDate = parseLocalDate(l.startDate);
                                   if (lDate.getMonth() === targetMonth && lDate.getFullYear() === targetYear) {
                                      leavesThisMonth += (Number(l.numberOfDays) || 1);
                                   }
                                }
                             });
                          }
                          const isFrequentAbsentee = leavesThisMonth >= 2;

                          // --- SMART WARNING 2: TEAM CONFLICT DETECTOR (30% Staff Rule) ---
                          let conflictingStaff = 0;
                          const targetLeaveStart = parseLocalDate(leave.date);
                          let targetLeaveEnd = new Date(targetLeaveStart);
                          if (leave.endDate) {
                             targetLeaveEnd = parseLocalDate(leave.endDate);
                          } else {
                             targetLeaveEnd.setDate(targetLeaveStart.getDate() + ((Number(leave.numberOfDays) || 1) - 1));
                          }

                          employees.forEach((otherEmp: any) => {
                             if (otherEmp.name === leave.name) return; // Skip self
                             const hasOverlap = Array.isArray(otherEmp.leaves) && otherEmp.leaves.some((l: any) => {
                                if (l.status !== 'approved') return false;
                                const lStart = parseLocalDate(l.startDate);
                                let lEnd = new Date(lStart);
                                if (l.endDate) {
                                   lEnd = parseLocalDate(l.endDate);
                                } else {
                                   lEnd.setDate(lStart.getDate() + ((Number(l.numberOfDays) || 1) - 1));
                                }
                                // Check if date ranges overlap
                                return (lStart <= targetLeaveEnd) && (lEnd >= targetLeaveStart);
                             });
                             if (hasOverlap) conflictingStaff++;
                          });

                          const totalStaff = employees.length;
                          const isConflict = totalStaff > 0 && (conflictingStaff / totalStaff) >= 0.30;
                          
                          return (
                          <tr key={leave.id} className={`hover:bg-slate-50 transition-colors ${isWeekendLeave ? 'bg-red-50/30' : ''}`}>
                            <td className="p-4 font-bold text-slate-700 font-sans">
                              {leave.name}
                              
                              {/* BADGES SECTION */}
                              <div className="flex flex-col gap-1 mt-1 items-start">
                                {holiday && (
                                  <div className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-200 inline-block uppercase font-sans">
                                    ⚠️ Holiday: {holiday.name}
                                  </div>
                                )}
                                {isFrequentAbsentee && (
                                  <div className="bg-purple-100 text-purple-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-purple-200 inline-block uppercase font-sans" title="Employee has already taken 2 or more leaves in this month.">
                                    📊 &gt;2 Leaves This Month
                                  </div>
                                )}
                                {isConflict && (
                                  <div className="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded border border-rose-200 inline-block uppercase font-sans" title="Approving this will result in over 30% of your staff being absent simultaneously!">
                                    🚨 High Dept Absence
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-slate-600 font-medium whitespace-nowrap font-sans">
                              {parseLocalDate(leave.date).toLocaleDateString('en-GB')}
                              {isWeekendLeave && (
                                <span className="ml-2 bg-rose-100 text-rose-700 text-[10px] font-black px-2 py-0.5 rounded border border-rose-200 uppercase tracking-widest inline-block animate-pulse font-sans" title="This date falls on a Saturday or Sunday!">
                                  Weekend
                                </span>
                              )}
                            </td>
                            <td className="p-4">
                              <div 
                                className="text-slate-600 max-w-xs truncate" 
                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(leave.reason || "") }}
                              />
                            </td>
                            <td className="p-4 text-center font-sans">
                              <span className="bg-slate-100 px-2 py-1 rounded font-bold text-slate-700">
                                {leave.numberOfDays}
                              </span>
                            </td>
                            <td className="p-4">
                              <input 
                                type="text" 
                                placeholder="Add remark..." 
                                className="border rounded-lg p-2 text-xs w-full focus:ring-2 focus:ring-[#006141] outline-none disabled:bg-gray-100 disabled:cursor-not-allowed font-sans" 
                                value={remarks[leave.id] || ""} 
                                onChange={(e) => setRemarks({...remarks, [leave.id]: e.target.value})} 
                                disabled={userRole === 'clerk' || userRole === 'staff'} 
                              />
                            </td>
                            <td className="p-4 flex gap-2 justify-center flex-wrap items-center">
                              {/* MULTI-LEVEL APPROVAL: Supervisor sees pending_supervisor leaves */}
                              {leave.status === 'pending_supervisor' ? (
                                (userRole === 'hod' || userRole === 'admin' || userRole === 'clerk' || userRole === 'pa') ? (
                                  <>
                                    <div className="w-full text-center mb-1">
                                      <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded border border-amber-200 uppercase tracking-widest font-sans">
                                        ⏳ Awaiting Supervisor Review
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => handleSupervisorDecision(leave.id, 'recommend')}
                                      className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] uppercase px-3 py-1.5 rounded-md shadow-sm transition-all whitespace-nowrap font-sans"
                                    >
                                      ✅ Recommend
                                    </button>
                                    <button
                                      onClick={() => handleSupervisorDecision(leave.id, 'reject')}
                                      className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] uppercase px-3 py-1.5 rounded-md shadow-sm transition-all whitespace-nowrap font-sans"
                                    >
                                      ❌ Reject
                                    </button>
                                  </>
                                ) : (
                                  <span className="px-2 py-1.5 bg-amber-50 text-amber-600 rounded text-[10px] font-bold uppercase tracking-wider border border-amber-200 font-sans">
                                    Pending Supervisor
                                  </span>
                                )
                              ) : (userRole === 'hod' || userRole === 'admin') ? (
                                <>
                                  <button 
                                    onClick={() => {
                                      let confirmMsg = `Are you sure you want to approve this leave?`;
                                      if (holiday) confirmMsg = `This date is a Holiday (${holiday.name}).\n\nClick OK to Approve as COMPENSATED (No CL deduction).\nClick Cancel to Approve as NORMAL CL.`;
                                      if (isConflict) confirmMsg = `WARNING: Approving this leave puts over 30% of your department on leave at the same time.\n\n` + confirmMsg;
                                      
                                      if (holiday) {
                                          const isComp = window.confirm(confirmMsg);
                                          handleAction(leave.id, 'approved', isComp);
                                      } else {
                                          if (isConflict && !window.confirm(confirmMsg)) return;
                                          handleAction(leave.id, 'approved', false);
                                      }
                                    }} 
                                    className="bg-emerald-600 text-white px-2 py-1.5 rounded-md font-bold hover:bg-emerald-700 shadow-sm transition-all text-[11px] whitespace-nowrap font-sans"
                                  >
                                    {holiday || isConflict ? "Approve (Review)" : "Approve"}
                                  </button>
                                  
                                  {!holiday && (
                                    <button 
                                      onClick={() => handleAction(leave.id, 'approved', true)} 
                                      className="bg-teal-700 text-white px-2 py-1.5 rounded-md font-bold hover:bg-teal-800 shadow-sm transition-all text-[11px] whitespace-nowrap font-sans" 
                                      title="Approve without deducting from balance"
                                    >
                                      Comp-Off
                                    </button>
                                  )}

                                  <button 
                                    onClick={() => handleAction(leave.id, 'rejected')} 
                                    className="bg-rose-600 text-white px-2 py-1.5 rounded-md font-bold hover:bg-rose-700 shadow-sm transition-all text-[11px] whitespace-nowrap font-sans"
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <span className="px-2 py-1.5 bg-gray-200 text-gray-500 rounded text-[10px] font-bold uppercase tracking-wider border border-gray-300 font-sans">
                                  Read-Only View
                                </span>
                              )}
                              <button 
                                onClick={() => handlePrintSelectedIso([leave], empInfo)} 
                                className="bg-blue-600 text-white px-2 py-1.5 rounded-md font-bold hover:bg-blue-700 shadow-sm transition-all text-[11px] whitespace-nowrap font-sans"
                              >
                                ISO
                              </button>
                            </td>
                          </tr>
                        )})
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              
              {/* STAFF DIRECTORY & REPORTING */}
              <div className="bg-white p-6 border-b bg-slate-50 flex flex-col gap-5 rounded-2xl shadow-sm border border-slate-200 mt-8 relative z-10 font-sans">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                  <div>
                    <h3 className="font-bold text-slate-800 uppercase text-lg flex items-center gap-2 font-sans">
                      <span className="w-2 h-6 bg-[#006141] rounded-full"></span>
                      Staff Directory & reporting
                    </h3>
                  </div>
                  <div className="relative w-full md:w-80">
                    <span className="absolute left-3 top-2.5 opacity-40">🔍</span>
                    <input 
                      type="text" 
                      placeholder="Search by name or role..." 
                      value={searchTerm} 
                      onChange={(e) => setSearchTerm(e.target.value)} 
                      className="w-full border border-slate-300 rounded-xl pl-10 pr-4 py-2 focus:ring-2 focus:ring-[#006141] outline-none transition-all font-sans" 
                    />
                  </div>
                </div>
                
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm gap-4">
                  
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-black text-slate-400 uppercase font-sans">Period Filter</span>
                    <input 
                      type="date" 
                      value={fromDate} 
                      onChange={(e) => setFromDate(e.target.value)} 
                      className="border rounded-lg p-2 text-sm focus:ring-2 focus:ring-[#006141] w-full sm:w-auto font-sans" 
                    />
                    <span className="text-slate-400 hidden sm:inline">→</span>
                    <input 
                      type="date" 
                      value={toDate} 
                      onChange={(e) => setToDate(e.target.value)} 
                      className="border rounded-lg p-2 text-sm focus:ring-2 focus:ring-[#006141] w-full sm:w-auto font-sans" 
                    />
                    <button 
                      onClick={() => { setFromDate(""); setToDate(""); }} 
                      className="text-xs text-rose-500 hover:bg-rose-50 px-2 py-1 rounded font-bold transition-all whitespace-nowrap font-sans"
                    >
                      Reset Dates
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-start xl:justify-end font-sans">
                    {userRole === 'admin' && (
                      <button 
                        onClick={() => setViewMode('admin-panel')} 
                        className="h-11 bg-slate-800 text-white px-4 rounded-xl font-black shadow-lg hover:bg-slate-900 transition-all flex items-center justify-center gap-2 border-2 border-slate-900 whitespace-nowrap font-sans"
                      >
                        ⚙️ MANAGE USERS
                      </button>
                    )}
                    {userRole === 'admin' && (
                      <button 
                        onClick={handleYearEndReset} 
                        className="h-11 bg-red-600 text-white px-4 rounded-xl font-black shadow-lg hover:bg-red-700 transition-all flex items-center justify-center gap-2 border-2 border-red-800 whitespace-nowrap font-sans"
                      >
                        ⚠️ RESET
                      </button>
                    )}
                    <button 
                      onClick={() => handleGenerateReport('bulk')} 
                      disabled={isGenerating} 
                      className="h-11 bg-[#006141] disabled:bg-slate-300 text-white px-6 rounded-xl font-bold shadow-lg hover:bg-[#004d34] transition-all flex items-center w-full sm:w-auto justify-center gap-2 whitespace-nowrap font-sans"
                    >
                      {isGenerating ? "Preparing..." : `📄 Generate Report`}
                    </button>
                    <button 
                      onClick={() => handleGenerateReport('compact-report')} 
                      disabled={isGenerating} 
                      className="h-11 bg-emerald-600 disabled:bg-slate-300 text-white px-6 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition-all flex items-center w-full sm:w-auto justify-center gap-2 whitespace-nowrap font-sans"
                    >
                      📊 Compact Summary
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto bg-white border border-slate-200 shadow-sm rounded-2xl mt-4 relative z-10 font-sans">
                <table className="w-full text-left text-sm relative">
                  <thead className="bg-slate-50 text-slate-500 uppercase sticky top-0 shadow-sm z-10">
                    <tr>
                      <th className="p-4 w-12 text-center">
                        <input 
                          type="checkbox" 
                          className="w-5 h-5 cursor-pointer accent-[#006141] rounded-lg" 
                          checked={selectedIds.length === sortedAndFilteredEmployees.length && sortedAndFilteredEmployees.length > 0} 
                          onChange={handleSelectAll} 
                        />
                      </th>
                      <th className="p-4">Staff Name</th>
                      <th className="p-4">Designation</th>
                      <th className="p-4 text-right">Records</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs md:text-sm">
                    {sortedAndFilteredEmployees.map((emp: any) => (
                      <tr key={emp.id} className={`hover:bg-slate-50 transition-colors ${selectedIds.includes(emp.id) ? 'bg-green-50/50' : ''}`}>
                        <td className="p-4 text-center">
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 cursor-pointer accent-[#006141]" 
                            checked={selectedIds.includes(emp.id)} 
                            onChange={() => handleSelect(emp.id)} 
                          />
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full border border-slate-200 overflow-hidden bg-slate-100 flex items-center justify-center font-bold text-slate-500">
                               {emp.profilePic ? (
                                  <img src={emp.profilePic} alt="Profile" className="w-full h-full object-cover" />
                               ) : (
                                  <span>{emp.name?.charAt(0)?.toUpperCase() || '?'}</span>
                                )}
                            </div>
                            <div className="flex flex-col font-sans">
                              <span className="font-bold text-slate-700">{emp.name}</span>
                              <div className="text-xs text-slate-500 font-mono mt-0.5">@{emp.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-sans">
                          <span className="text-slate-500 uppercase text-[10px] font-black tracking-widest leading-none bg-slate-100 px-2 py-1 rounded">
                            {emp.designation || "STAFF"}
                          </span>
                        </td>
                        <td className="p-4 text-right font-sans">
                          <button 
                            onClick={() => handleEmployeeSelect(emp.id, emp.name)} 
                            className="text-[#006141] font-bold hover:underline"
                          >
                            View History
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* TOOLBAR FOR SECONDARY VIEWS */}
        {(viewMode === 'individual' || viewMode === 'bulk' || viewMode === 'iso-print' || viewMode === 'compact-report' || viewMode === 'print-attendance') && (
          <div className="p-6 border-b bg-slate-50 flex flex-wrap justify-between items-center print:hidden gap-4 mt-8 rounded-2xl shadow-sm border border-slate-200 font-sans">
            <button 
              onClick={() => setViewMode('list')} 
              className="text-slate-600 font-bold hover:text-slate-900 flex items-center gap-2 bg-white px-4 py-2 rounded-xl border shadow-sm transition-all whitespace-nowrap"
            >
              ⬅️ Back to Directory
            </button>
            {(viewMode === 'individual' || viewMode === 'bulk') && (
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm flex-wrap">
                <span className="text-xs font-black text-slate-400 uppercase ml-2">Adjust Window:</span>
                <input 
                  type="date" 
                  value={fromDate} 
                  onChange={(e) => setFromDate(e.target.value)} 
                  className="border rounded p-1 text-sm focus:ring-2 focus:ring-[#006141]" 
                />
                <span className="text-slate-400">→</span>
                <input 
                  type="date" 
                  value={toDate} 
                  onChange={(e) => setToDate(e.target.value)} 
                  className="border rounded p-1 text-sm focus:ring-2 focus:ring-[#006141]" 
                />
              </div>
            )}
            <button 
              onClick={handlePrint} 
              className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 whitespace-nowrap"
            >
              🖨️ Print Document
            </button>
          </div>
        )}

        {/* VIEW MODE: PRINT ATTENDANCE SHEETS */}
        {viewMode === 'print-attendance' && (
          <div id="printable-area" className="bg-slate-200 print:bg-white print:p-0">
            {attendanceData.map((emp: any) => {
              const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
              const [yrStr, moStr] = attendanceMonth.split('-');
              const yearNum = parseInt(yrStr, 10);
              const monthNum = parseInt(moStr, 10) - 1;
              const daysInMonth = new Date(yearNum, monthNum + 1, 0).getDate();

              // Calculate "Availed in this specific month"
              const availedThisMonth = (emp.leaves || []).reduce((acc: number, l: any) => {
                 if (l.status !== 'approved' || l.isCompensated) return acc;
                 const d = parseLocalDate(l.startDate);
                 if (d.getFullYear() === yearNum && d.getMonth() === monthNum) {
                    return acc + (Number(l.numberOfDays) || 1);
                 }
                 return acc;
              }, 0);

              const totalAvailed = 25 - (emp.balance?.remaining ?? 25);

              return (
                <div key={emp.id} className="w-[297mm] h-[210mm] print:w-[297mm] print:h-[210mm] bg-white border border-transparent mx-auto p-[10mm] box-border relative print:border-none break-after-page text-black flex flex-col justify-between shadow-xl print:shadow-none mb-8 print:mb-0 animate-fadeIn" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                   
                   {/* HEADER */}
                   <div className="text-center w-full relative mb-2">
                      <img src="/logo.png" className="absolute left-0 top-0 w-20 h-20 grayscale object-contain" alt="University logo" />
                      <h2 className="text-[20px] font-black uppercase tracking-wide leading-tight mt-1 text-black">Example Technical University</h2>
                      <h3 className="text-[16px] font-bold uppercase tracking-wide leading-tight mt-1 text-black">Department of Engineering</h3>
                      <h4 className="text-[16px] font-bold uppercase tracking-wide leading-tight mt-1 text-black border-b-[2px] border-black inline-block pb-0.5">
                         Attendance Sheet for {attendanceType === 'faculty' ? 'Faculty Members' : 'Staff Members'}
                      </h4>
                   </div>

                   {/* DETAILS ROW */}
                   <div className="flex justify-between items-end mb-2 text-[15px] font-bold px-2">
                      <div className="flex items-end">
                         <span className="whitespace-nowrap text-black">Name:</span>
                         <span className="font-bold text-[16px] uppercase border-b border-black w-[300px] inline-block ml-2">{emp.name}</span>
                      </div>
                      <div className="flex items-end">
                         <span className="whitespace-nowrap text-black">Designation:</span>
                         <span className="font-bold text-[16px] uppercase border-b border-black w-[250px] inline-block ml-2">{emp.designation}</span>
                      </div>
                      <div className="flex items-end">
                         <span className="whitespace-nowrap text-black">Month:</span>
                         <span className="font-bold text-[16px] uppercase border-b border-black w-[150px] inline-block text-center ml-2">{monthNames[monthNum]}-{yearNum}</span>
                      </div>
                   </div>

                   {/* MAIN CALENDAR GRID */}
                   <div className="flex-1 flex border-l border-t border-black mt-2 bg-white">
                      <div className="flex-1 border-r border-black">{renderAttendanceTableBlock(1, 11, emp, yearNum, monthNum, daysInMonth)}</div>
                      <div className="flex-1 border-r border-black">{renderAttendanceTableBlock(12, 22, emp, yearNum, monthNum, daysInMonth)}</div>
                      <div className="flex-1 border-r border-black">{renderAttendanceTableBlock(23, 33, emp, yearNum, monthNum, daysInMonth)}</div>
                   </div>

                   {/* FOOTER STATS & SIGNATURE */}
                   <div className="mt-4 flex justify-between items-end pl-2 pr-10">
                      <div className="text-[14px] font-bold w-[350px] text-black">
                         <div className="font-black uppercase mb-2 border-b-[2px] border-black inline-block pr-8 pb-0.5">Casual Leave:</div>
                         <div className="flex justify-between w-64 mb-1"><span>Total Availed</span> <span className="font-bold border-b border-black px-4 min-w-[40px] text-center">{totalAvailed}</span></div>
                         <div className="flex justify-between w-64 mb-1"><span>Balance</span> <span className="font-bold border-b border-black px-4 min-w-[40px] text-center">{emp.balance?.remaining ?? 25}</span></div>
                         <div className="flex justify-between w-64"><span>Availed in {monthNames[monthNum]}-{yearNum}</span> <span className="font-bold border-b border-black px-4 min-w-[40px] text-center">{availedThisMonth}</span></div>
                      </div>
                      
                      <div className="text-center w-80">
                         <div className="h-16 relative flex justify-center items-end">
                             <img src="/hod_signature.png" className="h-14 grayscale mix-blend-multiply opacity-80" alt="" onError={(e) => e.currentTarget.style.display = 'none'} />
                         </div>
                         <div className="border-t-[2px] border-black font-bold text-[15px] pt-1">Signature of Chairman</div>
                         <div className="text-[11px] text-gray-700 font-normal italic mt-0.5">(To be done on first working day of each month)</div>
                      </div>
                   </div>

                   {/* NOTES SECTION */}
                   <div className="mt-5 text-[11px] font-bold leading-tight text-black">
                      <div className="underline mb-1 uppercase tracking-widest text-[12px]">Notes:</div>
                      <ol className="list-decimal pl-5 space-y-0.5 m-0">
                         <li>The complete book of attendance sheet shall remain in the office of the chairman/H.O.D till the end of the month, then submited to PA for calculating casual leave.</li>
                         <li>The chairman/H.O.D shall circle each unfilled "Time In " column with red ink at 0930 hrs, (this is only to facilitate faculty members not for officers who attend first period in a hurry).</li>
                         <li>The chairman/H.O.D shall circle each "Time Out" column with red ink at 1635 hrs, if faculty member/officer has left university before 1630 hrs, without information.</li>
                         <li>For those either on casual leave or absent the full row on that particular date is to be filled by the chairman/H.O.D in red with appropriate remarks.</li>
                      </ol>
                   </div>
                </div>
              );
            })}
          </div>
        )}

        {/* VIEW MODE: INDIVIDUAL EMPLOYEE RECORD */}
        {viewMode === 'individual' && employeeRecord && (
          <div id="printable-area" className="p-10 print:p-0 bg-white mt-8 rounded-2xl font-sans">
            <div className="flex justify-between items-end mb-8 print:hidden flex-wrap gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase font-black tracking-tighter">Official Record For</p>
                <div className="flex items-center gap-4 mt-2">
                   {employeeRecord.profilePic && (
                      <div className="w-16 h-16 rounded-full border-2 border-[#006141] overflow-hidden">
                         <img src={employeeRecord.profilePic} className="w-full h-full object-cover" alt="Profile" />
                      </div>
                   )}
                   <p className="text-3xl font-black text-[#006141] print:text-black leading-none">{employeeRecord.name}</p>
                </div>
              </div>
              <div className="flex gap-4 items-center flex-wrap">
                <div className="text-right bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-xs text-gray-400 uppercase font-black tracking-tighter">Annual Quota Balance</p>
                  <p className="text-2xl font-black text-gray-800">
                    Remaining: <span className="text-emerald-600 print:text-black">{employeeRecord.balance?.remaining ?? 25} Days</span>
                  </p>
                </div>
                <button 
                  disabled={selectedIndividualLeaves.length === 0}
                  onClick={() => {
                    const empInfo = employees.find(e => e.name === employeeRecord.name) || employeeRecord;
                    const safeLeaves = Array.isArray(employeeRecord.leaves) ? employeeRecord.leaves : [];
                    const selectedLeavesData = safeLeaves.filter((l: any) => selectedIndividualLeaves.includes(l.id));
                    handlePrintSelectedIso(selectedLeavesData, empInfo);
                  }}
                  className="bg-[#006141] disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-4 rounded-xl font-bold shadow-md hover:bg-[#004d34] transition-all h-full whitespace-nowrap"
                >
                  Print Selected CL Forms ({selectedIndividualLeaves.length})
                </button>
                <button 
                  onClick={() => setViewMode('list')} 
                  className="bg-slate-200 text-slate-800 px-6 py-4 rounded-xl font-bold shadow-md hover:bg-slate-300 transition-all h-full whitespace-nowrap"
                >
                  Back
                </button>
              </div>
            </div>

            <table className="w-full text-left border-collapse border-2 border-gray-300">
              <thead className="bg-gray-100 print:bg-gray-200 font-sans">
                <tr>
                  <th className="p-3 border-2 border-gray-300 text-center w-10 print:hidden">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 cursor-pointer accent-[#006141]" 
                      checked={selectedIndividualLeaves.length > 0 && Array.isArray(employeeRecord.leaves) && selectedIndividualLeaves.length === filterLeavesByDate(employeeRecord.leaves).length} 
                      onChange={(e) => { 
                        if (e.target.checked && Array.isArray(employeeRecord.leaves)) {
                          setSelectedIndividualLeaves(filterLeavesByDate(employeeRecord.leaves).map((l: any) => l.id)); 
                        } else {
                          setSelectedIndividualLeaves([]); 
                        }
                      }} 
                    />
                  </th>
                  <th className="p-3 border-2 border-gray-300 uppercase text-xs font-black">Date</th>
                  <th className="p-3 border-2 border-gray-300 uppercase text-xs font-black">Reason for Leave</th>
                  <th className="p-3 border-2 border-gray-300 uppercase text-xs font-black text-center">Days</th>
                  <th className="p-3 border-2 border-gray-300 uppercase text-xs font-black text-center">Final Status</th>
                </tr>
              </thead>
              <tbody>
                {(!employeeRecord.leaves || !Array.isArray(employeeRecord.leaves) || filterLeavesByDate(employeeRecord.leaves).length === 0) ? (
                  <tr>
                    <td colSpan={6} className="p-10 text-center italic text-gray-400 border-2 border-gray-300">
                      No official records found within this timeframe.
                    </td>
                  </tr>
                ) : (
                  filterLeavesByDate(employeeRecord.leaves).map((l: any) => (
                    <tr key={l.id} className="print:break-inside-avoid">
                      <td className="p-3 border-2 border-gray-300 text-center print:hidden">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 cursor-pointer accent-[#006141]" 
                          checked={selectedIndividualLeaves.includes(l.id)} 
                          onChange={() => handleSelectIndividualLeave(l.id)} 
                        />
                      </td>
                      <td className="p-3 border-2 border-gray-300 font-bold">
                        {parseLocalDate(l.startDate).toLocaleDateString('en-GB')}
                      </td>
                      <td className="p-3 border-2 border-gray-300 text-sm">
                        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(l.reason || "") }} className="inline" />
                        {l.isCompensated && (
                          <span className="ml-2 bg-teal-100 text-teal-800 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase font-sans">
                            Comp-Off
                          </span>
                        )}
                      </td>
                      <td className="p-3 border-2 border-gray-300 font-bold text-center font-mono">
                        {l.numberOfDays || 1}
                      </td>
                      <td className="p-3 border-2 border-gray-300 font-black uppercase text-[10px] text-center font-sans">
                        {l.status}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW MODE: ADMIN PANEL */}
        {viewMode === 'admin-panel' && userRole === 'admin' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mt-8 p-6 print:hidden space-y-8 font-sans">
            <div className="flex flex-col md:flex-row justify-between items-center border-b pb-4 gap-4">
              <h3 className="font-bold text-slate-800 uppercase text-lg flex items-center gap-2 font-sans">
                <span className="w-2 h-6 bg-slate-800 rounded-full"></span>
                IT Admin: Staff & System Management
              </h3>
              <button 
                onClick={() => setViewMode('list')} 
                className="text-slate-600 font-bold hover:text-slate-900 flex items-center gap-2 bg-slate-100 px-6 py-2.5 rounded-xl border shadow-sm transition-all"
              >
                ⬅️ Back to Dashboard
              </button>
            </div>

            {/* --- PROFILE UPDATE REQUESTS (ADMIN VIEW) --- */}
            <div className="bg-emerald-50 p-6 rounded-xl border border-emerald-200 shadow-sm animate-fadeIn">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-black text-emerald-900 uppercase text-sm flex items-center gap-2 font-sans">
                  <span className="text-lg">🔄</span> Profile Update Requests
                </h4>
                {profileRequests.filter((r: any) => r.status === 'pending').length > 0 && (
                   <span className="bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full animate-pulse font-sans">
                     Action Required
                   </span>
                )}
              </div>
              
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-lg border border-emerald-200 bg-white relative">
                <table className="w-full text-left text-xs">
                  <thead className="bg-emerald-100 text-emerald-800 uppercase sticky top-0 font-sans z-10 shadow-sm">
                    <tr>
                      <th className="p-3 font-bold">Date</th>
                      <th className="p-3 font-bold">Employee</th>
                      <th className="p-3 font-bold">Requested Profile Changes</th>
                      <th className="p-3 font-bold text-center font-sans">New Avatar</th>
                      <th className="p-3 font-bold text-center font-sans">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-50 text-xs">
                    {profileRequests.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-slate-400 italic font-sans">No profile update requests found.</td></tr>
                    ) : profileRequests.map((r: any) => (
                      <tr key={r.id} className="hover:bg-emerald-50/50 transition-colors">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{parseLocalDate(r.created_at).toLocaleDateString('en-GB')}</td>
                        <td className="p-3 font-bold text-slate-800 font-sans">@{r.username}</td>
                        <td className="p-3 space-y-1 font-sans">
                          {r.name && <div><span className="text-slate-400 font-bold">Name:</span> {r.name}</div>}
                          {r.designation && <div><span className="text-slate-400 font-bold">Desig:</span> {r.designation}</div>}
                          {r.bps && <div><span className="text-slate-400 font-bold">BPS:</span> {r.bps}</div>}
                          {r.persNo && <div><span className="text-slate-400 font-bold">PersNo:</span> {r.persNo}</div>}
                          {r.phone && <div><span className="text-slate-400 font-bold">Phone:</span> {r.phone}</div>}
                          {r.email && <div><span className="text-slate-400 font-bold">Email:</span> {r.email}</div>}
                        </td>
                        <td className="p-3 text-center">
                          {r.profile_pic ? (
                            <img src={r.profile_pic} alt="New Avatar" className="w-10 h-10 rounded-full mx-auto object-cover border border-emerald-200" />
                          ) : <span className="text-slate-400 font-sans">-</span>}
                        </td>
                        <td className="p-3 text-center space-y-2">
                          {r.status === 'pending' ? (
                            <>
                              <button onClick={() => handleProfileRequestAction(r.id, 'approve')} className="w-full bg-emerald-600 text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 font-sans">Approve</button>
                              <button onClick={() => handleProfileRequestAction(r.id, 'reject')} className="w-full bg-rose-500 text-white px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 font-sans">Reject</button>
                            </>
                          ) : (
                            <span className={`font-black text-[10px] uppercase tracking-widest px-2 py-1 rounded border font-sans ${r.status === 'approved' ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
                              {r.status}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* IT HELP DESK SUPPORT TICKETS (ADMIN VIEW) */}
            <div className="bg-purple-50 p-6 rounded-xl border border-purple-200 shadow-sm animate-fadeIn">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-black text-purple-900 uppercase text-sm flex items-center gap-2 font-sans">
                  <span className="text-lg">🎫</span> Help Desk & Support Tickets
                </h4>
                {supportTickets.filter((t: any) => t.status === 'pending').length > 0 && (
                   <span className="bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full animate-pulse font-sans">
                     Action Required
                   </span>
                )}
              </div>
              
              <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-lg border border-purple-200 bg-white relative">
                <table className="w-full text-left text-xs font-sans">
                  <thead className="bg-purple-100 text-purple-800 uppercase sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-3 font-bold">Date</th>
                      <th className="p-3 font-bold">User</th>
                      <th className="p-3 font-bold">Subject / Message</th>
                      <th className="p-3 font-bold text-center">Attachment</th>
                      <th className="p-3 font-bold text-center font-sans">Status / Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-50 text-xs">
                    {supportTickets.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-slate-400 italic font-sans">No support tickets found.</td></tr>
                    ) : supportTickets.map((t: any) => (
                      <tr key={t.id} className="hover:bg-purple-50/50 transition-colors font-sans">
                        <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{parseLocalDate(t.created_at).toLocaleDateString('en-GB')}</td>
                        <td className="p-3 font-bold text-slate-800">@{t.username}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{t.subject}</div>
                          <div className="text-slate-600 mt-1 max-w-xs md:max-w-md line-clamp-2">{t.message}</div>
                        </td>
                        <td className="p-3 text-center">
                          {t.attachment_path ? (
                            <button type="button" onClick={() => handleViewAttachment(t.id)} className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider hover:bg-purple-200 transition-colors inline-block whitespace-nowrap font-sans">
                              View File
                            </button>
                          ) : <span className="text-slate-400">-</span>}
                        </td>
                        <td className="p-3 text-center">
                          {t.status === 'resolved' ? (
                            <span className="text-green-600 font-black text-[10px] uppercase tracking-widest bg-green-50 px-2 py-1 rounded border border-green-200 font-sans">Resolved</span>
                          ) : (
                            <button 
                              onClick={() => handleResolveTicket(t.id)} 
                              className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-sm whitespace-nowrap font-sans"
                            >
                              Mark Resolved
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-xl border border-blue-200 shadow-sm flex flex-col xl:flex-row gap-8 animate-fadeIn">
              <div className="flex-1">
                <h4 className="font-black text-blue-900 uppercase text-sm mb-4 flex items-center gap-2 font-sans">
                  <span className="text-lg">📅</span> Master Holiday Calendar
                </h4>
                <p className="text-xs text-blue-800 mb-4 font-medium leading-relaxed font-sans">
                  Enter official holidays here. Staff taking leave across these dates will automatically <b>NOT</b> be deducted.
                </p>
                <form onSubmit={handleAddHoliday} className="flex flex-col sm:flex-row gap-3 items-end">
                  <div className="w-full sm:w-auto flex-1">
                    <label className="block text-[10px] font-bold text-blue-700 mb-1 uppercase font-sans">Holiday Name</label>
                    <input 
                      required 
                      placeholder="E.g. Eid-ul-Fitr (Day 1)" 
                      className="w-full border border-blue-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-sans" 
                      value={newHolidayName} 
                      onChange={e => setNewHolidayName(e.target.value)} 
                    />
                  </div>
                  <div className="w-full sm:w-auto">
                    <label className="block text-[10px] font-bold text-blue-700 mb-1 uppercase font-sans">Date</label>
                    <input 
                      required 
                      type="date" 
                      className="w-full border border-blue-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-sans" 
                      value={newHolidayDate} 
                      onChange={e => setNewHolidayDate(e.target.value)} 
                    />
                  </div>
                  <button 
                    type="submit" 
                    className="w-full sm:w-auto bg-blue-700 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-800 transition-all shadow-md h-[38px] whitespace-nowrap font-sans"
                  >
                    Add Holiday
                  </button>
                </form>
              </div>

              <div className="flex-1 bg-white rounded-lg border border-blue-200 overflow-hidden h-48 overflow-y-auto shadow-sm relative">
                <table className="w-full text-left text-xs font-sans border-collapse">
                  <thead className="bg-blue-100 text-blue-800 uppercase sticky top-0 font-sans z-10 shadow-sm">
                    <tr>
                      <th className="p-3 font-bold">Holiday Date</th>
                      <th className="p-3 font-bold">Description</th>
                      <th className="p-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-50">
                    {holidays.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-slate-400 italic">
                          No holidays configured for this year.
                        </td>
                      </tr>
                    ) : (
                      holidays.map((h: any) => (
                        <tr key={h.id} className="hover:bg-slate-50 font-sans">
                          <td className="p-3 font-bold font-mono text-slate-700">
                            {parseLocalDate(h.date).toLocaleDateString('en-GB')}
                          </td>
                          <td className="p-3 text-slate-600 font-medium">{h.name}</td>
                          <td className="p-3 text-center">
                            <button 
                              onClick={() => handleDeleteHoliday(h.id)} 
                              className="text-red-500 hover:text-red-700 font-bold uppercase text-[10px] bg-red-50 px-2 py-1 rounded font-sans"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner animate-fadeIn">
              <h4 className="font-black text-slate-700 uppercase text-sm mb-4 font-sans">➕ Register New Staff Member</h4>
              <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Full Name</label>
                  <input 
                    required 
                    placeholder="E.g., Dr. Jane Doe" 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-sans" 
                    value={newUser.name} 
                    onChange={e => setNewUser({...newUser, name: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Login Username</label>
                  <input 
                    required 
                    placeholder="E.g., Dr. Jane Doe" 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-sans" 
                    value={newUser.username} 
                    onChange={e => setNewUser({...newUser, username: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Initial Password</label>
                  <input 
                    required 
                    type="password" 
                    placeholder="At least 12 characters" 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-sans" 
                    value={newUser.password} 
                    onChange={e => setNewUser({...newUser, password: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">System Role</label>
                  <select 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white font-sans" 
                    value={newUser.role} 
                    onChange={e => setNewUser({...newUser, role: e.target.value})}
                  >
                    <option value="employee">Employee / Staff</option>
                    <option value="clerk">Clerk / Viewer</option>
                    <option value="hod">HOD / Approver</option>
                    <option value="admin">IT Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Designation</label>
                  <input 
                    required 
                    placeholder="E.g., Professor" 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-sans" 
                    value={newUser.designation} 
                    onChange={e => setNewUser({...newUser, designation: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Personnel No.</label>
                  <input 
                    placeholder="Optional" 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-sans" 
                    value={newUser.persNo} 
                    onChange={e => setNewUser({...newUser, persNo: e.target.value})} 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">BPS Grade</label>
                  <input 
                    placeholder="Optional" 
                    className="w-full border border-slate-300 rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none font-sans" 
                    value={newUser.bps} 
                    onChange={e => setNewUser({...newUser, bps: e.target.value})} 
                  />
                </div>
                <button 
                  type="submit" 
                  className="bg-slate-800 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-900 transition-all shadow-md h-[38px] flex justify-center items-center gap-2 whitespace-nowrap font-sans"
                >
                  Create User
                </button>
              </form>
            </div>

            {/* IT ADMIN MASTER CONTROLS PANEL */}
            <div className="bg-slate-900 text-white p-6 rounded-xl border border-slate-700 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h4 className="font-extrabold text-yellow-400 text-sm uppercase tracking-wider">🔒 MASTER IT OPERATIONS</h4>
                <p className="text-slate-300 text-xs mt-1 font-medium">Generate spreadsheet summary reports or trigger complete yearly quota resets.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={handleExportExcel}
                  className="bg-[#006141] hover:bg-[#004d34] text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border border-[#004d34] flex items-center gap-2 shadow"
                >
                  📊 Export Compact Summary to Excel
                </button>
                <button 
                  onClick={handleYearEndReset}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-all border border-red-700 shadow"
                >
                  ⚠️ Reset All Quotas (25 Days)
                </button>
              </div>
            </div>

            {/* SECURITY/UX BUG FIX: Self-contained max-height with locked horizontal slider */}
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto rounded-xl border border-slate-200 shadow-sm relative">
              <table className="w-full text-left text-sm relative border-collapse">
                <thead className="bg-slate-100 text-slate-500 uppercase sticky top-0 shadow-sm z-20">
                  <tr>
                    <th className="p-4 font-bold font-sans">Name & Username</th>
                    <th className="p-4 font-bold font-sans">Designation</th>
                    <th className="p-4 font-bold font-sans text-center">System Role</th>
                    <th className="p-4 font-bold font-sans text-center">Leave Quota</th>
                    <th className="p-4 font-bold font-sans text-center">Reports To (Supervisor) ℹ️</th>
                    <th className="p-4 font-bold text-right font-sans pr-10">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs md:text-sm">
                  {[...enrichedEmployees].sort(compareStaffOrder).map((emp: any) => (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{emp.name}</div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">@{emp.username}</div>
                      </td>
                      <td className="p-4 text-xs font-bold uppercase text-slate-600 font-sans">{emp.designation}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider font-sans
                          ${emp.role === 'admin' ? 'bg-purple-100 text-purple-700' : 
                            emp.role === 'hod' ? 'bg-[#006141] text-white' : 
                            emp.role === 'clerk' ? 'bg-blue-100 text-blue-700' : 
                            'bg-slate-100 text-slate-600'}`}>
                          {emp.role}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`font-black font-sans ${emp.balance?.remaining < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {emp.balance?.remaining ?? 25} Days
                        </span>
                      </td>
                      {/* MULTI-LEVEL APPROVAL: Supervisor assignment dropdown */}
                      <td className="p-4 text-center">
                        {/* HOD and Admin accounts don't need a supervisor */}
                        {emp.role === 'hod' ? (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 font-sans uppercase tracking-wider">
                            HOD — No Approval Needed
                          </span>
                        ) : (
                          <select
                            value={emp.supervisor_id || ""}
                            onChange={(e) => handleSupervisorChange(emp.id, e.target.value)}
                            className="bg-slate-50 border border-slate-300 text-xs rounded-lg p-1.5 font-sans focus:outline-none focus:border-emerald-600 w-full max-w-[200px]"
                          >
                            <option value="">— Skip: Direct to HOD —</option>
                            {supervisors
                              .filter((sup: any) => sup.id !== emp.id)
                              .map((sup: any) => (
                                <option key={sup.id} value={sup.id}>
                                  {sup.name} · {sup.designation || sup.role.toUpperCase()}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                      <td className="p-4 text-right pr-10">
                        {/* BUTTON CONTAINER OPTIMIZATION: Pack actions tighter to fit landscape layouts */}
                        <div className="flex flex-wrap gap-1.5 justify-end items-center">
                          <button 
                            onClick={() => handleDelegateAuthority(emp.id, emp.role)} 
                            className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all shadow-sm border whitespace-nowrap uppercase tracking-wider ${emp.role === 'hod' ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-600 hover:text-white' : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-600 hover:text-white'}`}
                          >
                            {emp.role === 'hod' ? 'Revoke HOD' : 'Acting HOD'}
                          </button>
                          <button 
                            onClick={() => handleUpdateBalance(emp.id)} 
                            className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg text-[10px] font-black hover:bg-emerald-600 hover:text-white transition-all shadow-sm border border-emerald-200 whitespace-nowrap uppercase tracking-wider"
                          >
                            Fix Balance
                          </button>
                          {/* FUTURE-PROOF: Toggle any employee as a supervisor without code changes */}
                          <button 
                            onClick={() => handleToggleSupervisor(emp.id, emp.is_supervisor)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all shadow-sm border whitespace-nowrap uppercase tracking-wider ${emp.is_supervisor ? 'bg-teal-600 text-white border-teal-700 hover:bg-teal-700' : 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-600 hover:text-white'}`}
                            title={emp.is_supervisor ? 'Remove from supervisor list' : 'Grant supervisor/incharge privileges — they will appear in staff assignment dropdowns'}
                          >
                            {emp.is_supervisor ? '✅ Incharge' : '＋ Incharge'}
                          </button>
                          <button 
                            onClick={() => handleAdminResetPassword(emp.id, emp.name)} 
                            className="bg-amber-50 text-amber-700 px-2 py-1 rounded-lg text-[10px] font-black hover:bg-amber-600 hover:text-white transition-all shadow-sm border border-amber-200 whitespace-nowrap uppercase tracking-wider"
                            title="Reset secure credential set"
                          >
                            Reset Pass
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(emp.id)} 
                            className="bg-rose-50 text-rose-700 px-2 py-1 rounded-lg text-[10px] font-black hover:bg-rose-600 hover:text-white transition-all shadow-sm border border-rose-200 whitespace-nowrap uppercase tracking-wider"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW MODE: BULK REPORT */}
        {viewMode === 'bulk' && (
          <div id="printable-area" className="bg-white print:p-0">
            {bulkReportData.map((emp: any, index: number) => (
              <div key={emp.id} className="p-10 print:p-8 break-after-page min-h-screen print:min-h-0">
                <div className="flex items-center mb-6 border-b-2 border-black pb-4">
                  <img src="/logo.png" alt="University logo" className="w-20 h-20 grayscale object-contain" />
                  <div className="text-center flex-grow">
                    <h2 className="text-2xl font-black uppercase">
                      Example Technical University
                    </h2>
                    <h3 className="text-lg font-bold uppercase mt-1">
                      Department of Engineering
                    </h3>
                    <h4 className="text-md font-bold mt-2 bg-gray-200 inline-block px-4 py-1 border border-black">
                      Detailed Staff Leave Record
                    </h4>
                  </div>
                  <div className="w-20"></div> 
                </div>
                
                <div className="flex justify-between mb-6 items-end">
                  <div className="space-y-1 font-serif">
                    <p className="text-sm">
                      <span className="font-bold inline-block w-24">Name:</span> 
                      <span className="uppercase font-bold text-lg">{emp.name}</span>
                    </p>
                    <p className="text-sm">
                      <span className="font-bold inline-block w-24">Designation:</span> 
                      <span className="uppercase">{emp.designation}</span>
                    </p>
                    <p className="text-sm">
                      <span className="font-bold inline-block w-24">Pers No:</span> 
                      <span className="font-mono bg-gray-100 px-2 border">{emp.persNo || '-'}</span> 
                      &nbsp;&nbsp;&nbsp;&nbsp; 
                      <span className="font-bold">BPS:</span> 
                      <span className="font-mono bg-gray-100 px-2 border">{emp.bps || '-'}</span>
                    </p>
                  </div>
                  <div className="text-right border-2 border-black p-3 bg-gray-50 shadow-sm">
                    <p className="text-xs font-bold uppercase text-gray-500 tracking-wider font-sans">
                      Available Leave Balance
                    </p>
                    <p className="text-3xl font-black mt-1 text-green-700 print:text-black">
                      {emp.balance?.remaining ?? 25} <span className="text-sm">Days</span>
                    </p>
                  </div>
                </div>

                <table className="w-full text-left border-collapse border border-black text-sm font-serif">
                  <thead className="bg-gray-100 print:bg-gray-200">
                    <tr>
                      <th className="p-2 border border-black uppercase text-xs font-black">Date</th>
                      <th className="p-2 border border-black uppercase text-xs font-black">Reason</th>
                      <th className="p-2 border border-black uppercase text-xs font-black text-center font-sans">Days</th>
                      <th className="p-2 border border-black uppercase text-xs font-black text-center font-sans">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filterLeavesByDate(emp.leaves).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center italic text-gray-500 border border-black">
                          No leaves found for this period.
                        </td>
                      </tr>
                    ) : (
                      filterLeavesByDate(emp.leaves).map((l: any) => (
                        <tr key={l.id}>
                          <td className="p-2 border border-black whitespace-nowrap font-mono">
                            {parseLocalDate(l.startDate).toLocaleDateString('en-GB')}
                          </td>
                          <td className="p-2 border border-black">
                             <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(l.reason || "") }} className="inline" />
                             {l.isCompensated && (
                               <span className="ml-2 bg-gray-200 border border-black text-[10px] font-bold px-1 py-0.5 uppercase font-sans">
                                 Comp-Off
                               </span>
                             )}
                          </td>
                          <td className="p-2 border border-black text-center font-bold">
                            {l.numberOfDays || 1}
                          </td>
                          <td className="p-2 border border-black text-center font-bold uppercase text-[10px] font-sans">
                            {l.status}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="mt-12 flex justify-between items-end print:mt-16 font-sans">
                  <div className="text-xs font-bold text-gray-600">
                    Printed on: {new Date().toLocaleString('en-GB')}
                  </div>
                  <div className="text-center w-48 border-t border-black pt-2">
                    <span className="font-bold uppercase text-xs">Chairman / HOD</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* VIEW MODE: COMPACT REPORT */}
        {viewMode === 'compact-report' && (
          <div id="printable-area" className="p-8 print:p-4 bg-white mt-8">
            <div className="flex items-center mb-6 border-b-2 border-black pb-4 animate-fadeIn">
              <img src="/logo.png" alt="University logo" className="w-20 h-20 grayscale object-contain" />
              <div className="text-center flex-grow font-sans">
                <h2 className="text-2xl font-black uppercase">
                  Example Technical University
                </h2>
                <h3 className="text-lg font-bold uppercase mt-1">
                  Department of Engineering
                </h3>
                <h4 className="text-md font-bold mt-2 bg-gray-200 inline-block px-4 py-1 border border-black">
                  Staff Leave Summary Report
                </h4>
                {(fromDate || toDate) && (
                  <p className="text-sm mt-2 font-bold text-gray-600 font-sans">
                    Period: {fromDate ? parseLocalDate(fromDate).toLocaleDateString('en-GB') : 'Beginning of records'} 
                    {' '}to{' '} 
                    {toDate ? parseLocalDate(toDate).toLocaleDateString('en-GB') : 'Present'}
                  </p>
                )}
              </div>
              <div className="w-20"></div>
            </div>
            
            <table className="w-full text-left border-collapse border border-black text-sm font-sans">
              <thead className="bg-gray-100 print:bg-gray-200">
                <tr>
                  <th className="p-2 border border-black uppercase text-[10px] font-black text-center w-8">Sr.</th>
                  <th className="p-2 border border-black uppercase text-[10px] font-black text-center w-20">Pers No</th>
                  <th className="p-2 border border-black uppercase text-[10px] font-black">Name</th>
                  <th className="p-2 border border-black uppercase text-[10px] font-black">Designation</th>
                  <th className="p-2 border border-black uppercase text-[10px] font-black text-center w-12">BPS</th>
                  <th className="p-2 border border-black uppercase text-[10px] font-black text-center w-20">Leaves Taken</th>
                  
                  {/* LWP Days Column */}
                  <th className="p-2 border border-black uppercase text-[10px] font-black text-center w-20">LWP Days</th>
                  <th className="p-2 border border-black uppercase text-[10px] font-black text-center w-20">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {bulkReportData.map((emp: any, idx: number) => {
                  const filteredLeaves = filterLeavesByDate(emp.leaves);
                  const leavesTaken = filteredLeaves.reduce((acc: number, l: any) => 
                    (l.status === 'approved' && !l.isCompensated) ? acc + (Number(l.numberOfDays) || 1) : acc, 0
                  );
                  const currentRemaining = typeof emp.balance?.remaining === 'number' 
                    ? emp.balance.remaining 
                    : (parseInt(emp.balance?.remaining) || 0);
                  const lwpDays = currentRemaining < 0 ? Math.abs(currentRemaining) : 0;
                  const officialRemaining = currentRemaining < 0 ? 0 : currentRemaining;

                  return (
                    <tr key={emp.id} className="hover:bg-gray-50 print:hover:bg-transparent">
                      <td className="p-1 border border-black text-center text-xs">{idx + 1}</td>
                      <td className="p-1 border border-black font-mono text-center text-xs">{emp.persNo || '-'}</td>
                      <td className="p-1 border border-black font-bold uppercase text-xs">{emp.name}</td>
                      <td className="p-1 border border-black text-[10px] uppercase">{emp.designation}</td>
                      <td className="p-1 border border-black text-center font-bold text-xs">{emp.bps || '-'}</td>
                      <td className="p-1 border border-black text-center font-bold text-slate-800">{leavesTaken}</td>
                      
                      {/* LWP Value */}
                      <td className="p-1 border border-black text-center font-bold text-red-600 print:text-black">
                        {lwpDays > 0 ? `${lwpDays} LWP` : '-'}
                      </td>
                      
                      <td className="p-1 border border-black text-center font-bold text-green-700 print:text-black">{officialRemaining}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-16 flex justify-between items-end font-sans">
              <div className="text-left text-xs font-bold text-gray-600">
                Printed on: {new Date().toLocaleString('en-GB')}
              </div>
              <div className="text-center w-48 border-t border-black pt-2">
                <span className="font-bold uppercase text-[10px]">Chairman / HOD</span>
              </div>
            </div>
          </div>
        )}

        {/* VIEW MODE: ISO PRINT */}
        {viewMode === 'iso-print' && selectedIsoLeaves.length > 0 && (
          <div id="printable-area" className="bg-white print:p-0 print:m-0 print:min-h-0 print:block mt-8">
            <PrintableLeaveForm leaveDataArray={selectedIsoLeaves} />
            <div className="mt-4 print:hidden flex justify-center gap-4 font-sans">
               <button 
                 onClick={handlePrint} 
                 className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2 whitespace-nowrap"
               >
                 🖨️ Print Forms
               </button>
               <button 
                 onClick={() => setViewMode('list')} 
                 className="text-slate-600 font-bold hover:text-slate-900 flex items-center gap-2 bg-slate-200 px-6 py-2 rounded-xl border shadow-sm transition-all whitespace-nowrap"
               >
                 Cancel
               </button>
            </div>
          </div>
        )}

        {/* VIEW MODE: APPLY LEAVE (HOD ONLY) */}
        {viewMode === 'apply-leave' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mt-8 p-6 print:hidden font-sans">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b pb-4 gap-4">
              <h3 className="font-bold text-slate-800 uppercase text-lg flex items-center gap-2">
                <span className="w-2 h-6 bg-amber-500 rounded-full"></span>
                Apply for Personal Leave (HOD)
              </h3>
              <button 
                onClick={() => setViewMode('list')} 
                className="text-slate-600 font-bold hover:text-slate-900 flex items-center gap-2 bg-slate-100 px-6 py-2.5 rounded-xl border shadow-sm transition-all"
              >
                ⬅️ Back to Dashboard
              </button>
            </div>
            
            <div className="max-w-2xl mx-auto">
              <form onSubmit={handleApplySubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Start Date</label>
                    <input 
                      type="date" 
                      required 
                      value={applyStartDate} 
                      onChange={handleStartDateChange} 
                      className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#006141] outline-none" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">End Date</label>
                    <input 
                      type="date" 
                      required 
                      value={applyEndDate} 
                      onChange={handleEndDateChange} 
                      className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-[#006141] outline-none" 
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-600 uppercase">Total Days Applied</span>
                    <span className={`text-2xl font-black ${applyDays > 0 ? 'text-[#006141]' : 'text-red-500'}`}>
                      {applyDays}
                    </span>
                  </div>
                  {isSandwich && (
                    <div className="bg-orange-100 border-l-4 border-orange-500 p-2 text-xs text-orange-800 font-bold uppercase tracking-wide rounded-r mt-1">
                      ⚠️ Sandwich Rule Applied: Weekends included in count.
                    </div>
                  )}
                  {overlappingHolidays > 0 && (
                    <div className="bg-blue-100 border-l-4 border-blue-500 p-2 text-xs text-blue-800 font-bold uppercase tracking-wide rounded-r mt-1">
                      🎉 Public Holiday Detected: {overlappingHolidays} day(s) automatically subtracted from deduction!
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Reason</label>
                  <textarea 
                    required 
                    rows={4} 
                    value={applyReason} 
                    onChange={(e) => setApplyReason(e.target.value)} 
                    className="w-full border border-slate-300 rounded-lg p-3 focus:ring-2 focus:ring-[#006141] outline-none"
                  ></textarea>
                </div>
                <button 
                  type="submit" 
                  className="w-full bg-[#006141] text-white font-black py-4 rounded-xl hover:bg-[#004d34] transition-all shadow-lg text-lg uppercase tracking-wide"
                >
                  Record Application
                </button>
              </form>
            </div>
          </div>
        )}

        {/* VIEW MODE: MY LEAVES (HOD ONLY) */}
        {viewMode === 'my-leaves' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 mt-8 p-6 print:hidden font-sans">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b pb-4 gap-4">
              <h3 className="font-bold text-slate-800 uppercase text-lg flex items-center gap-2">
                <span className="w-2 h-6 bg-indigo-600 rounded-full"></span>
                My Leave History (HOD)
              </h3>
              <div className="flex gap-4 flex-wrap font-sans">
                <button 
                  disabled={selectedIndividualLeaves.length === 0} 
                  onClick={() => handlePrintMyLeaves(myLeaves.filter(l => selectedIndividualLeaves.includes(l.id)))} 
                  className="bg-blue-600 disabled:bg-slate-300 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-blue-700 transition-all shadow-md"
                >
                  🖨️ Print Selected ISO Form ({selectedIndividualLeaves.length})
                </button>
                <button 
                  onClick={() => setViewMode('list')} 
                  className="text-slate-600 font-bold hover:text-slate-900 flex items-center gap-2 bg-slate-100 px-6 py-2.5 rounded-xl border shadow-sm transition-all"
                >
                  ⬅️ Back to Dashboard
                </button>
              </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-6 items-center font-sans">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 w-48">
                <p className="text-xs text-slate-500 font-black uppercase mb-1">Available Balance</p>
                <p className="text-3xl font-black text-[#006141]">{myBalance} <span className="text-sm opacity-50 font-bold">Days</span></p>
              </div>
              <p className="text-sm text-slate-500 max-w-md italic font-semibold">
                Select your required leaves below and print the ISO form. It will automatically generate with checkboxes for the Dean's manual approval.
              </p>
            </div>

            <table className="w-full text-left text-sm border-2 border-slate-200">
              <thead className="bg-slate-100 text-slate-500 uppercase">
                <tr>
                  <th className="p-3 text-center border-b-2 border-slate-200 w-12 col-span-1">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 cursor-pointer accent-[#006141]" 
                      checked={selectedIndividualLeaves.length === myLeaves.length && myLeaves.length > 0} 
                      onChange={(e) => { 
                        if (e.target.checked) {
                          setSelectedIndividualLeaves(myLeaves.map((l: any) => l.id)); 
                        } else {
                          setSelectedIndividualLeaves([]); 
                        }
                      }} 
                    />
                  </th>
                  <th className="p-3 border-b-2 border-slate-200">Applied Date</th>
                  <th className="p-3 border-b-2 border-slate-200">Reason</th>
                  <th className="p-3 border-b-2 border-slate-200">Days</th>
                  <th className="p-3 border-b-2 border-slate-200">System Status</th>
                </tr>
              </thead>
              <tbody>
                {myLeaves.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center italic text-slate-400">
                      No leaves found.
                    </td>
                  </tr>
                ) : (
                  myLeaves.map((leave: any) => (
                    <tr key={leave.id} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="p-3 text-center">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 cursor-pointer accent-[#006141]" 
                          checked={selectedIndividualLeaves.includes(leave.id)} 
                          onChange={() => handleSelectIndividualLeave(leave.id)} 
                        />
                      </td>
                      <td className="p-3 font-bold font-sans">
                        {parseLocalDate(leave.startDate).toLocaleDateString('en-GB')}
                      </td>
                      <td className="p-3">
                        <div 
                          className="text-slate-600 font-sans" 
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(leave.reason || "") }} 
                        />
                        {/* THE RED WITHDRAW BUTTON FOR HOD */}
                        {leave.status === 'pending' && (
                          <button 
                            onClick={() => handleCancelLeave(leave.id)}
                            className="mt-2 text-[10px] font-black uppercase bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg border border-rose-100 hover:bg-rose-100 transition-all block w-max font-sans"
                          >
                            Withdraw Application
                          </button>
                        )}
                      </td>
                      <td className="p-3 font-black text-[#006141] font-mono">
                        {leave.numberOfDays || 1}
                      </td>
                      <td className="p-3 font-sans">
                        <span className="px-2 py-1 rounded text-[10px] font-black uppercase bg-slate-200 text-slate-600 font-sans">
                          {leave.status === 'pending' ? 'PENDING DEAN SIGNATURE' : leave.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

        {/* ── MEMO VIEW (HOD/Admin/Clerk personal memo) ── */}
        {viewMode === 'memo' && (
          <div className="print:hidden mt-8">
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setViewMode('list')}
                className="text-slate-600 font-bold hover:text-slate-900 flex items-center gap-2 bg-white px-4 py-2 rounded-xl border shadow-sm transition-all whitespace-nowrap"
              >
                ⬅️ Back to Dashboard
              </button>
            </div>
            <MemoSystem userData={userData} />
          </div>
        )}

    </>
  );
}
