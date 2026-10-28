import { useState } from "react"; 
import { Switch, Route, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Login from "./pages/Login"; 
import EmployeeDashboard from "./pages/EmployeeDashboard";
import HodDashboard from "./pages/HODDashboard"; 

const queryClient = new QueryClient();

function App() {
  const [location, setLocation] = useLocation();
  const [portalMode, setPortalMode] = useState<'admin' | 'personal'>('admin');

  // Grab the role to check privileges
  const role = localStorage.getItem("userRole") || "";
  
  // Who is allowed to see the HodDashboard at all?
  const isManagement = ['hod', 'admin', 'clerk', 'pa'].includes(role);
  
  // Who is allowed to toggle back to the Employee view? (HOD removed)
  const canTogglePortal = ['admin', 'clerk', 'pa'].includes(role);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-50 font-sans border-t-[12px] border-[#006141] flex flex-col">
        {/* FULL-WIDTH HEADER */}
        <header className="bg-white shadow-md py-6 px-4 md:px-10 border-b">
          <div className="max-w-full mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h1 className="text-[#006141] font-extrabold text-2xl uppercase tracking-tighter">
                Example Technical University
              </h1>
              <p className="text-slate-500 font-semibold text-sm">
                Department of Engineering
              </p>
            </div>
            
            {location !== "/login" && location !== "/" && (
              <div className="flex items-center gap-3">
                
                {/* THE MAGIC TOGGLE BUTTON FOR ADMINS & CLERKS */}
                {canTogglePortal && location === "/dashboard" && (
                  <button 
                    onClick={() => setPortalMode(prev => prev === 'admin' ? 'personal' : 'admin')}
                    className={`${portalMode === 'admin' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#006141] hover:bg-[#004d34]'} text-white px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-all flex items-center gap-2`}
                  >
                    {portalMode === 'admin' ? '👤 APPLY FOR MY LEAVE' : '⚙️ BACK TO ADMIN PANEL'}
                  </button>
                )}

              </div>
            )}
          </div>
        </header>

        {/* FULL-WIDTH MAIN CONTENT AREA */}
        <main className="max-w-full px-4 md:px-10 py-10 flex-grow w-full">
          <Switch>
            <Route path="/login" component={Login} />
            
            {/* STRICTER ROUTING LOGIC */}
            <Route path="/dashboard">
              {() => {
                // 1. The HOD is permanently locked into the Management Dashboard
                if (role === 'hod') {
                  return <HodDashboard />;
                }

                // 2. Admins/Clerks who haven't toggled to personal view see the Admin Dashboard
                if (isManagement && portalMode === 'admin') {
                  return <HodDashboard />;
                }
                
                // 3. Normal staff OR Admins/Clerks who clicked the personal button see Employee Dashboard
                return <EmployeeDashboard />;
              }}
            </Route>

            <Route path="/">
              {/* Keep the landing page welcome card centered and readable */}
              <div className="bg-white p-12 rounded-xl shadow-lg border border-slate-200 text-center max-w-lg mx-auto mt-20">
                <div className="w-20 h-20 bg-[#006141] rounded-full mx-auto mb-6 flex items-center justify-center">
                  <span className="text-white text-3xl font-bold">LM</span>
                </div>
                <h2 className="text-3xl font-bold text-slate-800 mb-2">Portal Active</h2>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">
                  Official leave management system for department staff.
                </p>
                <div className="flex gap-4 justify-center">
                  <button 
                    onClick={() => setLocation("/login")}
                    className="bg-[#006141] text-white px-8 py-3 rounded-lg font-bold shadow-md hover:bg-[#004d34] transition-all"
                  >
                    Login to Apply
                  </button>
                </div>
              </div>
            </Route>
          </Switch>
        </main>

        {/* FULL-WIDTH CUSTOM CREDITS & COPYRIGHT FOOTER */}
        <footer className="bg-white border-t border-slate-200 py-8 mt-auto print:hidden">
          <div className="max-w-full mx-auto px-4 md:px-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="text-center md:text-left">
              <p className="text-slate-800 font-bold text-sm">
                Prepared and Created by <span className="text-[#006141] font-black text-base uppercase tracking-tight ml-1">CLMS Contributors</span>
              </p>
              <p className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mt-1">
                Leave Management System • Department of Engineering
              </p>
            </div>
            <div className="text-center md:text-right">
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest">
                Copyright © Example Technical University, 2026
              </p>
            </div>
          </div>
        </footer>

        <ToastContainer position="bottom-right" theme="colored" />
      </div>
    </QueryClientProvider>
  );
}

export default App;