import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [, setLocation] = useLocation();

  // --- Forgot Password States ---
  const [showForgot, setShowForgot] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotPersNo, setForgotPersNo] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [forgotError, setForgotError] = useState("");
  
  // --- Captcha States ---
  const [captchaText, setCaptchaText] = useState("");
  const [userCaptcha, setUserCaptcha] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Login Captcha States (server-verified) ---
  const [loginCaptchaId, setLoginCaptchaId] = useState("");
  const [loginCaptchaImage, setLoginCaptchaImage] = useState("");
  const [loginCaptchaAnswer, setLoginCaptchaAnswer] = useState("");
  const [loginCaptchaBusy, setLoginCaptchaBusy] = useState(false);

  const loadLoginCaptcha = useCallback(async () => {
    setLoginCaptchaBusy(true);
    setLoginCaptchaAnswer("");
    try {
      const response = await fetch("/api/captcha");
      const data = await response.json();
      if (!response.ok || !data.success || !data.captcha_id || !data.image) {
        throw new Error(data.error || "Could not load the security check.");
      }
      setLoginCaptchaId(data.captcha_id);
      setLoginCaptchaImage(data.image);
    } catch (err) {
      setLoginCaptchaId("");
      setLoginCaptchaImage("");
      setError(err instanceof Error ? err.message : "Could not load the security check.");
    } finally {
      setLoginCaptchaBusy(false);
    }
  }, []);

  useEffect(() => {
    loadLoginCaptcha();
  }, [loadLoginCaptcha]);

  // Generate dynamic canvas captcha
  const generateCaptcha = useCallback(() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let text = "";
    for (let i = 0; i < 6; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaText(text);

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, 150, 50);
        ctx.fillStyle = "#f1f5f9"; // slate-100
        ctx.fillRect(0, 0, 150, 50);
        
        // Add some noise lines
        for (let i = 0; i < 5; i++) {
          ctx.strokeStyle = `rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255},0.5)`;
          ctx.beginPath();
          ctx.moveTo(Math.random() * 150, Math.random() * 50);
          ctx.lineTo(Math.random() * 150, Math.random() * 50);
          ctx.stroke();
        }

        ctx.font = "bold 24px monospace";
        ctx.fillStyle = "#0f172a"; // slate-900
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        // Draw characters with slight rotation
        for (let i = 0; i < text.length; i++) {
          ctx.save();
          ctx.translate(20 + i * 20, 25);
          const rotation = (Math.random() - 0.5) * 0.4;
          ctx.rotate(rotation);
          ctx.fillText(text[i], 0, 0);
          ctx.restore();
        }
      }
    }
  }, []);

  useEffect(() => {
    if (showForgot) {
      generateCaptcha();
      setUserCaptcha("");
      setForgotMsg("");
      setForgotError("");
      setForgotUsername("");
      setForgotPersNo("");
    }
  }, [showForgot, generateCaptcha]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!loginCaptchaId) {
      setError("The security check is not loaded yet. Click Refresh and try again.");
      return;
    }
    if (loginCaptchaAnswer.trim().length !== 6) {
      setError("Enter the six characters shown in the security check.");
      return;
    }

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          captcha_id: loginCaptchaId,
          captcha_answer: loginCaptchaAnswer.trim().toUpperCase(),
        })
      });
      
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid username or password.");
        loadLoginCaptcha();
        return;
      }

      // SECURITY UPGRADE: Wipe old local data to prevent conflicts
      localStorage.clear();
      sessionStorage.clear();

      // SECURITY UPGRADE: Save JWT Token and details to Session Storage instead of Local Storage
      sessionStorage.setItem("token", data.token);
      sessionStorage.setItem("username", username);
      sessionStorage.setItem("userName", data.name);
      sessionStorage.setItem("userRole", data.role);
      sessionStorage.setItem("persNo", data.persNo || "");
      sessionStorage.setItem("bps", data.bps || "");

      // ROUTING FIX: Save role to LocalStorage so your App.tsx router doesn't break!
      localStorage.setItem("userRole", data.role);
      localStorage.setItem("username", username);

      if (data.requiresPasswordChange) {
        alert("Notice: You are using a temporary password. Please update it in your profile.");
      }

      setLocation("/dashboard");
    } catch (err) {
      setError("Failed to connect to the server.");
      loadLoginCaptcha();
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMsg("");
    setForgotError("");

    // 1. Captcha Check
    if (userCaptcha.toLowerCase() !== captchaText.toLowerCase()) {
      setForgotError("Incorrect Security Captcha. Please try again.");
      generateCaptcha();
      setUserCaptcha("");
      return;
    }

    // 4. API Request
    try {
      const response = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          username: forgotUsername, 
          persNo: forgotPersNo
        })
      });
      
      const data = await response.json();

      if (!response.ok) {
        setForgotError(data.error || "Failed to reset password. Check your details.");
        return;
      }

      setForgotMsg(data.message);
      // Reset fields after success
      setTimeout(() => setShowForgot(false), 3000); // Auto close after 3 seconds
    } catch (err) {
      setForgotError("Server error. Please try again later.");
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20 bg-white p-10 rounded-2xl shadow-xl border border-slate-200 relative overflow-hidden">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-extrabold text-[#006141]">Staff Login</h2>
        <p className="text-slate-500 text-sm mt-2">Department of Engineering</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold mb-6 text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-6">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border border-slate-300 rounded-lg p-3 text-slate-800 focus:outline-none focus:border-[#006141] focus:ring-1 focus:ring-[#006141]"
            placeholder="e.g., jsmith"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg p-3 text-slate-800 focus:outline-none focus:border-[#006141] focus:ring-1 focus:ring-[#006141]"
            placeholder="••••••••"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Security Check</label>
          <div className="flex items-center gap-3 mb-2">
            {loginCaptchaImage ? (
              <img
                src={loginCaptchaImage}
                alt="Six-character security code"
                width={220}
                height={68}
                draggable={false}
                className="border border-slate-200 rounded-lg bg-slate-50"
              />
            ) : (
              <div className="w-[220px] h-[68px] flex items-center justify-center border border-slate-200 rounded-lg bg-slate-50 text-xs text-slate-500">
                {loginCaptchaBusy ? "Loading security check…" : "Security check unavailable"}
              </div>
            )}
            <button
              type="button"
              onClick={loadLoginCaptcha}
              disabled={loginCaptchaBusy}
              title="Get a new security code"
              aria-label="Get a new security code"
              className="border border-slate-300 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loginCaptchaBusy ? "…" : "Refresh"}
            </button>
          </div>
          <input
            type="text"
            value={loginCaptchaAnswer}
            onChange={(e) => setLoginCaptchaAnswer(e.target.value.toUpperCase().replace(/[^A-HJ-KM-NP-Z2-9]/g, "").slice(0, 6))}
            className="w-full border border-slate-300 rounded-lg p-3 text-slate-800 text-center text-lg font-bold tracking-widest focus:outline-none focus:border-[#006141] focus:ring-1 focus:ring-[#006141]"
            placeholder="Enter the six characters"
            minLength={6}
            maxLength={6}
            autoComplete="off"
            spellCheck={false}
            disabled={!loginCaptchaId}
            required
          />
          <p className="text-[11px] text-slate-500 mt-1">A new code is required for every sign-in attempt.</p>
        </div>

        <button type="submit" className="w-full bg-[#006141] hover:bg-[#004d34] text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-md">
          Sign In
        </button>
      </form>

      <div className="mt-6 text-center">
        <button 
          type="button"
          onClick={() => setShowForgot(true)}
          className="text-sm text-[#006141] hover:underline font-bold"
        >
          Forgot Password?
        </button>
      </div>

      {/* --- BEAUTIFUL FORGOT PASSWORD MODAL OVERLAY --- */}
      <div className={`absolute top-0 left-0 w-full h-full bg-slate-50 z-20 transition-transform duration-300 ease-in-out flex flex-col p-8 overflow-y-auto ${showForgot ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-extrabold text-[#006141]">Request Password Reset</h3>
          <button onClick={() => setShowForgot(false)} className="text-slate-400 hover:text-red-500 font-bold text-xl">&times;</button>
        </div>

        {forgotMsg ? (
          <div className="flex flex-col items-center justify-center h-full space-y-4">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-3xl">✓</div>
            <p className="text-green-700 font-bold text-center">{forgotMsg}</p>
            <p className="text-sm text-slate-500 text-center">Your request has been submitted to IT Administration.<br/>Please contact them or wait for approval.</p>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4 flex-1">
            
            {forgotError && <div className="bg-red-50 text-red-600 p-2 rounded text-xs font-bold text-center border border-red-100">{forgotError}</div>}
            
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <p className="text-xs font-black text-slate-400 uppercase border-b pb-1">Verify Identity</p>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Username</label>
                <input type="text" value={forgotUsername} onChange={(e) => setForgotUsername(e.target.value)} className="w-full border rounded p-2 text-sm focus:outline-none focus:border-[#006141]" required />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Personal Number (Pers No)</label>
                <input type="text" value={forgotPersNo} onChange={(e) => setForgotPersNo(e.target.value)} className="w-full border rounded p-2 text-sm focus:outline-none focus:border-[#006141]" required />
              </div>
            </div>

            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-sm flex flex-col gap-3">
              <div>
                <label className="block text-[10px] font-bold text-blue-700 uppercase mb-1">Security Check</label>
                <div className="flex items-center gap-3 bg-white p-2 rounded border border-blue-200">
                  <canvas ref={canvasRef} width="150" height="50" className="bg-slate-100 rounded cursor-pointer" onClick={generateCaptcha} title="Click to refresh CAPTCHA"></canvas>
                  <button type="button" onClick={generateCaptcha} className="text-xs text-blue-600 hover:text-blue-800 underline font-bold">Refresh</button>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-blue-700 uppercase mb-1">Enter Security Code</label>
                <input type="text" value={userCaptcha} onChange={(e) => setUserCaptcha(e.target.value)} className="w-full border border-blue-200 rounded p-2 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest uppercase" required placeholder="Type code here" />
              </div>
            </div>

            <button type="submit" className="w-full bg-[#006141] hover:bg-[#004d34] text-white font-bold py-3 rounded-lg shadow-md transition-colors mt-4 uppercase tracking-wider">
              Submit Reset Request
            </button>
            
            <div className="text-center mt-2">
              <button type="button" onClick={() => setShowForgot(false)} className="text-xs text-slate-500 hover:text-slate-800 underline font-semibold">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}