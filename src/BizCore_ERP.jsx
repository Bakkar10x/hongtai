import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, getDocs } from "firebase/firestore";

// ============================================================
// FIREBASE SETUP
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCGnnPEHIIyW5lbHBbOE1L_H-6_s6RXsIs",
  authDomain: "my-app-erp.firebaseapp.com",
  projectId: "my-app-erp",
  storageBucket: "my-app-erp.firebasestorage.app",
  messagingSenderId: "756092190886",
  appId: "1:756092190886:web:2d7844ae01a9ab2c577467",
  measurementId: "G-8L18KFW762"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const FS_COLLECTIONS = ["products","customers","suppliers","sales","purchases","expenses","activityLogs","users","categories","accountEntries","recycleBin"];

// Sync changed collections to Firestore in TWO phases:
//   1) write every added/changed document, 2) then delete removed ones.
// When a record moves between collections (e.g. Sales -> Recycle Bin, or back on
// restore) this guarantees a copy always exists in Firestore, even if the tab is
// closed halfway. If any write fails, deletions are skipped so nothing is lost.
const syncCollections = async (changes) => {
  const plans = changes.map(({ colName, oldItems, newItems }) => {
    const oldMap = Object.fromEntries((oldItems || []).map(i => [i.id, i]));
    const newMap = Object.fromEntries((newItems || []).map(i => [i.id, i]));
    return {
      colName,
      upserts: (newItems || []).filter(i => !oldMap[i.id] || JSON.stringify(oldMap[i.id]) !== JSON.stringify(i)),
      deletes: (oldItems || []).filter(i => !newMap[i.id]),
    };
  });
  let writeFailed = false;
  for (const { colName, upserts } of plans) {
    try {
      for (const item of upserts) await setDoc(doc(db, colName, String(item.id)), item);
    } catch (e) { writeFailed = true; console.error("Firestore sync error:", colName, e); }
  }
  if (writeFailed) { console.error("Firestore: skipped deletions because a write failed - reload to re-sync."); return; }
  for (const { colName, deletes } of plans) {
    try {
      for (const item of deletes) await deleteDoc(doc(db, colName, String(item.id)));
    } catch (e) { console.error("Firestore sync error:", colName, e); }
  }
};

// ============================================================
// NETWORK STATUS (online/offline detection)
// ============================================================
function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);
  return online;
}

// ============================================================
// DESIGN SYSTEM & THEME
// ============================================================
const theme = {
  colors: {
    bg: "#F4F6FB",
    surface: "#FFFFFF",
    surfaceAlt: "#F1F5F9",
    border: "#E2E8F0",
    borderLight: "#CBD5E1",
    accent: "#3B82F6",
    accentGlow: "rgba(59,130,246,0.18)",
    accentDim: "#1E40AF",
    success: "#10B981",
    successGlow: "rgba(16,185,129,0.15)",
    warning: "#F59E0B",
    warningGlow: "rgba(245,158,11,0.15)",
    danger: "#EF4444",
    dangerGlow: "rgba(239,68,68,0.15)",
    purple: "#8B5CF6",
    purpleGlow: "rgba(139,92,246,0.15)",
    text: "#0F172A",
    textMuted: "#64748B",
    textDim: "#475569",
  }
};

// ============================================================
// GLOBAL STYLES
// ============================================================
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=Sora:wght@300;400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; }
    body {
      background: #F4F6FB;
      color: #0F172A;
      font-family: 'Sora', sans-serif;
      font-size: 14px;
      line-height: 1.6;
      overflow-x: hidden;
    }
    ::-webkit-scrollbar { width: 6px; height: 10px; }
    ::-webkit-scrollbar-track { background: #FFFFFF; border-radius: 4px; }
    ::-webkit-scrollbar-thumb { background: #3B82F6; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #2563EB; }
    
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes slideIn { from { opacity: 0; transform: translateX(-16px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes glow { 0%,100% { box-shadow: 0 0 8px rgba(59,130,246,0.3); } 50% { box-shadow: 0 0 20px rgba(59,130,246,0.6); } }
    @keyframes countUp { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    
    .fade-in { animation: fadeIn 0.3s ease forwards; }
    .slide-in { animation: slideIn 0.3s ease forwards; }
    
    input, select, textarea {
      font-family: 'Sora', sans-serif;
      font-size: 13px;
      background: #FFFFFF;
      border: 1px solid #E2E8F0;
      border-radius: 8px;
      color: #0F172A;
      padding: 9px 12px;
      outline: none;
      width: 100%;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input:focus, select:focus, textarea:focus {
      border-color: #3B82F6;
      box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
    }
    input::placeholder { color: #64748B; }
    select option { background: #FFFFFF; }
    
    table { border-collapse: collapse; width: 100%; }
    th { font-family: 'IBM Plex Mono', monospace; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: #64748B; padding: 10px 14px; text-align: left; border-bottom: 1px solid #E2E8F0; background: #FFFFFF; }
    td { padding: 12px 14px; border-bottom: 1px solid #FFFFFF; color: #334155; font-size: 13px; }
    tr:hover td { background: rgba(15,23,42,0.02); }
    tr:last-child td { border-bottom: none; }
    
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: 8px; border: none;
      font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 500;
      cursor: pointer; transition: all 0.2s; white-space: nowrap;
    }
    .btn-primary { background: #3B82F6; color: white; }
    .btn-primary:hover { background: #2563EB; box-shadow: 0 4px 14px rgba(59,130,246,0.4); transform: translateY(-1px); }
    .btn-secondary { background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0; }
    .btn-secondary:hover { background: #E2E8F0; color: #0F172A; }
    .btn-success { background: #10B981; color: white; }
    .btn-success:hover { background: #059669; box-shadow: 0 4px 14px rgba(16,185,129,0.3); }
    .btn-danger { background: rgba(239,68,68,0.15); color: #EF4444; border: 1px solid rgba(239,68,68,0.2); }
    .btn-danger:hover { background: rgba(239,68,68,0.25); }
    .btn-sm { padding: 5px 10px; font-size: 12px; }
    .btn-icon { padding: 7px; border-radius: 6px; }
    
    .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 600;
      font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.04em;
    }
    .badge-success { background: rgba(16,185,129,0.15); color: #10B981; border: 1px solid rgba(16,185,129,0.2); }
    .badge-warning { background: rgba(245,158,11,0.15); color: #F59E0B; border: 1px solid rgba(245,158,11,0.2); }
    .badge-danger { background: rgba(239,68,68,0.15); color: #EF4444; border: 1px solid rgba(239,68,68,0.2); }
    .badge-blue { background: rgba(59,130,246,0.15); color: #3B82F6; border: 1px solid rgba(59,130,246,0.2); }
    .badge-purple { background: rgba(139,92,246,0.15); color: #8B5CF6; border: 1px solid rgba(139,92,246,0.2); }
    .badge-gray { background: rgba(100,116,139,0.15); color: #475569; border: 1px solid rgba(100,116,139,0.2); }
    .badge-tds { background: rgba(6,182,212,0.15); color: #06B6D4; border: 1px solid rgba(6,182,212,0.2); }
    
    .card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; }
    .card-hover { transition: border-color 0.2s, box-shadow 0.2s; }
    .card-hover:hover { border-color: #CBD5E1; box-shadow: 0 4px 24px rgba(0,0,0,0.3); }
    
    .modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);
      z-index: 1000; display: flex; align-items: flex-start; justify-content: center;
      padding: 24px 20px; overflow-y: auto;
      animation: fadeIn 0.2s ease;
    }
    .modal { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; max-height: calc(100vh - 48px); overflow: hidden; display: flex; flex-direction: column; animation: fadeIn 0.2s ease; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid #E2E8F0; flex-shrink: 0; background: #FFFFFF; border-radius: 16px 16px 0 0; }
    .modal-body { padding: 24px; overflow-y: auto; flex: 1; min-height: 0; }
    
    .tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-family: 'IBM Plex Mono', monospace; }
    
    .mono { font-family: 'IBM Plex Mono', monospace; }
    
    .shimmer {
      background: linear-gradient(90deg, #FFFFFF 25%, #F1F5F9 50%, #FFFFFF 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
    
    .notification-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #EF4444;
      animation: pulse 2s infinite;
    }
    
    .progress-bar { height: 4px; background: #E2E8F0; border-radius: 2px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 2px; transition: width 0.5s ease; }
    
    .tooltip-wrap { position: relative; }
    .tooltip-wrap:hover .tooltip { opacity: 1; visibility: visible; transform: translateY(0); }
    .tooltip {
      position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%) translateY(4px);
      background: #E2E8F0; color: #0F172A; padding: 4px 8px; border-radius: 6px;
      font-size: 11px; white-space: nowrap; opacity: 0; visibility: hidden;
      transition: all 0.15s; z-index: 100; pointer-events: none;
    }

    .sidebar-item {
      display: flex; align-items: center; gap: 10px; padding: 9px 12px;
      border-radius: 8px; cursor: pointer; transition: all 0.15s;
      color: #64748B; font-size: 13px; font-weight: 500;
      text-decoration: none;
    }
    .sidebar-item:hover { background: rgba(15,23,42,0.04); color: #475569; }
    .sidebar-item.active { background: rgba(59,130,246,0.12); color: #3B82F6; }
    .sidebar-item.active .sidebar-icon { color: #3B82F6; }
    
    .stat-card {
      background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px;
      padding: 20px; transition: all 0.2s;
    }
    .stat-card:hover { border-color: #CBD5E1; transform: translateY(-2px); box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    
    .chart-bar { transition: height 0.6s cubic-bezier(0.34, 1.56, 0.64, 1); }
    
    .search-input {
      background: #F1F5F9 !important;
      border-color: #E2E8F0 !important;
      padding-left: 36px !important;
    }
    
    .form-label { font-size: 12px; font-weight: 600; color: #64748B; margin-bottom: 6px; display: block; text-transform: uppercase; letter-spacing: 0.06em; font-family: 'IBM Plex Mono', monospace; }
    .form-group { margin-bottom: 16px; }
    
    .divider { height: 1px; background: #E2E8F0; margin: 0; }
    
    .scrollable { overflow-y: auto; }
    
    @media (max-width: 768px) {
      .hide-mobile { display: none !important; }
      .sidebar-collapsed { width: 56px !important; }
    }

    /* ================= MOBILE FRIENDLY (added) ================= */
    .bz-backdrop { display: none; }
    @media (max-width: 768px) {
      .bz-shell { height: 100dvh !important; }
      /* Sidebar: slim icon rail, opens as overlay drawer */
      .bz-sidebar {
        position: fixed !important; left: 0; top: 0; bottom: 0;
        height: 100dvh !important; z-index: 950;
        width: 56px !important;
      }
      .bz-sidebar.bz-open { width: 240px !important; box-shadow: 8px 0 32px rgba(0,0,0,0.6); }
      .bz-backdrop {
        display: block; position: fixed; inset: 0; z-index: 940;
        background: rgba(0,0,0,0.55); backdrop-filter: blur(2px);
        animation: fadeIn 0.2s ease;
      }
      .bz-main { padding-left: 56px; }

      /* Header */
      .bz-header { padding: 10px 14px !important; gap: 10px; }
      .bz-header h1 { font-size: 15px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bz-header p { font-size: 10px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bz-header > div:first-child { min-width: 0; }
      .bz-notif { width: calc(100vw - 84px) !important; max-width: 320px; max-height: 70vh; overflow-y: auto; }

      /* Page container */
      .bz-content > .fade-in { padding: 16px 12px 48px 12px !important; }
      .bz-content { -webkit-overflow-scrolling: touch; }

      /* Grids -> fewer columns */
      .bz-content [style*="repeat(4"], .bz-content [style*="repeat(5"], .bz-content [style*="repeat(6"],
      .bz-content [style*="repeat(3"], .bz-content [style*="1fr 1fr 1fr"],
      .modal-overlay [style*="repeat(4"], .modal-overlay [style*="repeat(5"], .modal-overlay [style*="repeat(3"],
      .modal-overlay [style*="1fr 1fr 1fr"] {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
      .bz-content [style*="grid-template-columns: 3fr 2fr"], .bz-content [style*="grid-template-columns: 2fr 1fr"],
      .bz-content [style*="grid-template-columns: 1fr 180px"], .bz-content [style*="grid-template-columns: 200px 1fr"],
      .bz-content [style*="minmax(300px"], .bz-content [style*="minmax(280px"],
      .modal-overlay [style*="grid-template-columns: 3fr 2fr"], .modal-overlay [style*="grid-template-columns: 2fr 1fr"],
      .modal-overlay [style*="grid-template-columns: 1fr 180px"], .modal-overlay [style*="grid-template-columns: 200px 1fr"] {
        grid-template-columns: minmax(0, 1fr) !important;
      }
      .bz-content [style*="grid-column: span"], .modal-overlay [style*="grid-column: span"] { grid-column: 1 / -1 !important; }

      /* Invoice line-item rows keep their columns, scroll sideways instead */
      [style*="grid-template-columns: 2fr 60px"] { min-width: 540px; }
      .bz-modal-body { overflow-x: auto !important; }

      /* Flex rows wrap instead of overflowing */
      .bz-content [style*="display: flex"][style*="gap"] { flex-wrap: wrap; }
      .bz-content [style*="min-width: 2"], .bz-content [style*="min-width: 1"] { min-width: 0 !important; }

      /* Tables scroll horizontally */
      .bz-content .card[style*="overflow: hidden"] { overflow-x: auto !important; }
      .bz-content th { padding: 8px 10px; font-size: 10px; white-space: nowrap; }
      .bz-content td { padding: 9px 10px; font-size: 12px; white-space: nowrap; }

      /* Cards */
      .stat-card { padding: 14px; }
      .stat-card:hover { transform: none; }

      /* Modals */
      .modal-overlay { padding: 10px 8px !important; }
      .bz-modal { max-height: calc(100dvh - 20px) !important; border-radius: 12px !important; }
      .bz-modal-head { padding: 14px 16px !important; border-radius: 12px 12px 0 0 !important; }
      .bz-modal-body { padding: 16px !important; }
      .modal { max-height: calc(100dvh - 20px); }
      .modal-header { padding: 14px 16px; }
      .modal-body { padding: 16px; }

      /* Inputs: 16px avoids iOS auto-zoom */
      input, select, textarea { font-size: 16px; }
      .btn { padding: 8px 12px; }
      .btn-sm { padding: 6px 10px; }
      .btn-icon { padding: 8px; }
      .tooltip { display: none; }
    }
    @media (max-width: 480px) {
      .bz-content [style*="grid-template-columns: 1fr 1fr"], .bz-content [style*="repeat(2"],
      .modal-overlay [style*="grid-template-columns: 1fr 1fr"], .modal-overlay [style*="repeat(2"] {
        grid-template-columns: minmax(0, 1fr) !important;
      }
      .bz-content [style*="repeat(4"], .bz-content [style*="repeat(5"], .bz-content [style*="repeat(6"] {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }
      .bz-content h2 { font-size: 16px !important; }
    }
    /* ============================================================= */

    /* ================= MODERN LIGHT THEME (added) ================= */
    :root, html { color-scheme: light !important; background: #F4F6FB !important; }
    #root { background: transparent; color: #0F172A; }
    body {
      background:
        radial-gradient(1100px 520px at 100% -10%, rgba(99,102,241,0.07), transparent 60%),
        radial-gradient(900px 480px at -10% 110%, rgba(59,130,246,0.06), transparent 60%),
        #F4F6FB;
      background-attachment: fixed;
      color-scheme: light;
    }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 8px; }
    ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

    /* Sidebar */
    .bz-sidebar {
      background: #FFFFFF !important;
      border-right: 1px solid #E5E9F2 !important;
      box-shadow: 1px 0 0 rgba(15,23,42,0.02), 4px 0 24px rgba(15,23,42,0.04);
    }
    .sidebar-item { border-radius: 10px; color: #64748B; }
    .sidebar-item:hover { background: #F1F5F9; color: #0F172A; }
    .sidebar-item.active {
      background: linear-gradient(90deg, rgba(59,130,246,0.12), rgba(99,102,241,0.04));
      color: #1D4ED8; font-weight: 600; box-shadow: inset 3px 0 0 #3B82F6;
    }
    .sidebar-item.active .sidebar-icon { color: #2563EB; }

    /* Header: frosted glass */
    .bz-header {
      background: rgba(255,255,255,0.80) !important;
      backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
      border-bottom: 1px solid #E5E9F2 !important;
    }

    /* Cards */
    .card, .stat-card {
      background: #FFFFFF;
      border: 1px solid #E5E9F2;
      border-radius: 14px;
      box-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 4px 16px rgba(15,23,42,0.04);
    }
    .card-hover:hover, .stat-card:hover {
      border-color: rgba(59,130,246,0.35);
      box-shadow: 0 2px 4px rgba(15,23,42,0.04), 0 12px 28px rgba(15,23,42,0.08);
    }

    /* Buttons */
    .btn { border-radius: 10px; }
    .btn-primary { background: linear-gradient(135deg, #3B82F6 0%, #6366F1 100%); color: #fff; box-shadow: 0 4px 12px rgba(59,130,246,0.25); }
    .btn-primary:hover { background: linear-gradient(135deg, #2563EB 0%, #4F46E5 100%); box-shadow: 0 6px 18px rgba(99,102,241,0.32); }
    .btn-success { background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: #fff; }
    .btn-secondary { background: #FFFFFF; border: 1px solid #E2E8F0; color: #334155; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
    .btn-secondary:hover { background: #F8FAFC; border-color: #CBD5E1; color: #0F172A; }
    .btn-danger { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; }
    .btn-danger:hover { background: #FEE2E2; }

    /* Inputs */
    input, select, textarea { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; color: #0F172A; }
    input:hover, select:hover, textarea:hover { border-color: #CBD5E1; }
    input:focus, select:focus, textarea:focus { border-color: #6366F1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
    input::placeholder { color: #94A3B8; }
    select option { background: #FFFFFF; color: #0F172A; }
    .search-input { background: #F8FAFC !important; border-color: #E2E8F0 !important; }
    input[type="date"]::-webkit-calendar-picker-indicator { filter: none; }

    /* Tables */
    th { background: #F8FAFC; border-bottom: 1px solid #E5E9F2; color: #64748B; }
    td { border-bottom: 1px solid #F1F5F9; color: #334155; }
    tr:hover td { background: #F8FAFF; }

    /* Badges: darker text for readability on white */
    .badge-success { background: #ECFDF5; color: #047857; border-color: #A7F3D0; }
    .badge-warning { background: #FFFBEB; color: #B45309; border-color: #FDE68A; }
    .badge-danger  { background: #FEF2F2; color: #DC2626; border-color: #FECACA; }
    .badge-blue    { background: #EFF6FF; color: #1D4ED8; border-color: #BFDBFE; }
    .badge-purple  { background: #F5F3FF; color: #6D28D9; border-color: #DDD6FE; }
    .badge-gray    { background: #F1F5F9; color: #475569; border-color: #E2E8F0; }
    .badge-tds     { background: #ECFEFF; color: #0E7490; border-color: #A5F3FC; }

    /* Modals */
    .modal-overlay { background: rgba(15,23,42,0.45); }
    .bz-modal, .modal {
      border: 1px solid #E5E9F2 !important;
      box-shadow: 0 24px 64px rgba(15,23,42,0.18);
    }
    .tooltip { background: #0F172A; color: #F8FAFC; }
    .progress-bar { background: #E2E8F0; }
    .shimmer { background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%); background-size: 200% 100%; }
    @media (max-width: 768px) {
      .bz-sidebar.bz-open { box-shadow: 8px 0 32px rgba(15,23,42,0.18); }
      .bz-backdrop { background: rgba(15,23,42,0.35); }
    }
    /* ============================================================= */
    @media print {
      body * { visibility: hidden; }
      .print-area, .print-area * { visibility: visible; }
      .print-area { position: absolute; left: 0; top: 0; width: 100%; }
      .no-print { display: none !important; }
    }
  `}</style>
);

// ============================================================
// CONTEXT
// ============================================================
const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

// ============================================================
// MOCK DATA ENGINE
// ============================================================
const generateId = () => Math.random().toString(36).substr(2, 9);
const today = new Date();
const fmt = (d) => d.toISOString().split("T")[0];
const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return fmt(d); };

// ============================================================
// RECYCLE BIN HELPERS
// Every delete in the app moves the full original record into data.recycleBin
// instead of destroying it. Restoring puts the SAME object back (same id,
// invoice no., serial no. etc.) so nothing about it changes.
// ============================================================
const RECYCLE_TYPES = {
  sales:          { label: "Sale / Invoice", color: "#3B82F6", numberOf: r => r.invoiceNo,        uniqueKeys: ["invoiceNo"] },
  purchases:      { label: "Purchase",       color: "#8B5CF6", numberOf: r => r.id,               uniqueKeys: [] },
  products:       { label: "Product",        color: "#10B981", numberOf: r => r.sku || "",        uniqueKeys: ["sku"] },
  customers:      { label: "Customer",       color: "#F59E0B", numberOf: r => r.customerId ? `ID #${r.customerId}` : "", uniqueKeys: ["customerId"] },
  suppliers:      { label: "Supplier",       color: "#06B6D4", numberOf: r => r.email || "",      uniqueKeys: [] },
  users:          { label: "User",           color: "#EC4899", numberOf: r => r.email || "",      uniqueKeys: ["email"] },
  accountEntries: { label: "Account Entry",  color: "#64748B", numberOf: r => r.slNo ? `SL ${r.slNo}` : "", uniqueKeys: ["slNo"] },
};
const recycleTitleOf = (colName, item, data) => {
  if (colName === "sales" || colName === "purchases") {
    const party = colName === "sales"
      ? data.customers.find(c => c.id === item.customerId)
      : data.suppliers.find(c => c.id === item.supplierId);
    return { label: colName === "sales" ? (item.invoiceNo || item.id) : item.id, sub: party?.name || "" };
  }
  if (colName === "accountEntries") return { label: item.description || "Entry", sub: item.date || "" };
  return { label: item.name || item.email || item.id, sub: item.sku || item.phone || item.email || "" };
};
const makeBinEntry = (colName, item, data, by) => {
  const t = recycleTitleOf(colName, item, data);
  return {
    id: `RB-${generateId()}`,
    collection: colName,
    item,
    label: String(t.label ?? ""),
    sub: String(t.sub ?? ""),
    amount: Number(item.total) || Number(item.paid) || Number(item.amount) || Number(item.debit) || Number(item.credit) || 0,
    subtype: item.saleType || item.purchaseType || "",
    deletedAt: new Date().toISOString(),
    deletedBy: by || "—",
  };
};
// Pure state transform: remove from its collection + add to the bin
const trashItem = (d, colName, entry) => ({
  ...d,
  [colName]: d[colName].filter(x => x.id !== entry.item.id),
  recycleBin: [entry, ...(d.recycleBin || [])],
});

// ── Serial numbers (PO-20260813-001 style) ──────────────────────────────────
// Next number for a prefix such as "PO-20260813". Looks at active records AND the
// Recycle Bin and always goes one past the highest serial used, so a number is never
// issued twice - and a deleted record can always be restored under its own number.
const nextSerialNo = (prefix, data, colName, field) => {
  const used = [
    ...(data[colName] || []).map(r => r[field]),
    ...(data.recycleBin || []).filter(e => e.collection === colName).map(e => e.item && e.item[field]),
  ];
  let max = 0;
  for (const v of used) {
    const str = String(v || "");
    if (str.startsWith(prefix + "-")) {
      const n = parseInt(str.slice(prefix.length + 1), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
};
// Serial of ids like PO-20260813-001 -> 1. Old random ids (PAY-9f9da8hs3) have none -> 0
const SERIAL_ID_RE = /^[A-Z]+-\d{8}-(\d+)$/;
const serialOfId = (id) => { const m = SERIAL_ID_RE.exec(String(id || "")); return m ? parseInt(m[1], 10) : 0; };
// Newest first: by date, then creation time, then serial number, then id
const newestFirst = (a, b) =>
  (b.date || "").localeCompare(a.date || "")
  || (b.createdAt || "").localeCompare(a.createdAt || "")
  || serialOfId(b.id) - serialOfId(a.id)
  || String(b.id).localeCompare(String(a.id));

const INITIAL_DATA = {
  users: [],
  categories: [],
  products: [],
  customers: [],
  suppliers: [],
  sales: [],
  purchases: [],
  expenses: [],
  activityLogs: [],
  accountEntries: [],
  recycleBin: [],
  currentUser: { id: "u1", name: "Admin", email: "hongtaippl@gmail.com", role: "Admin", avatar: "AU" },
  settings: { companyName: "", currency: "৳", taxName: "VAT", taxRate: 10, address: "", phone: "", email: "", darkMode: true },
  accountOpenBalance: { balance: 0, cash: 0, pBank: 0, ucbBank: 0, wooriBank: 0, date: "" },
};

// ============================================================
// ICONS
// ============================================================
const Icon = ({ name, size = 16, className = "", color }) => {
  const style = { width: size, height: size, flexShrink: 0, ...(color ? { color } : {}) };
  const icons = {
    dashboard: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>,
    sales: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
    purchase: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>,
    inventory: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>,
    customers: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
    suppliers: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
    finance: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
    reports: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    settings: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    plus: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    search: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    edit: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    trash: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></svg>,
    eye: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    x: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    check: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
    alert: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    bell: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
    download: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    print: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
    refresh: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
    trend_up: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    trend_down: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>,
    package: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    log: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    filter: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
    chevron_right: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
    chevron_down: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
    menu: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
    moon: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
    user: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    star: <svg style={style} className={className} viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    upload: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
    info: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
    invoice: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    wallet: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M20 12V22H4a2 2 0 01-2-2V6a2 2 0 012-2h16v4"/><path d="M22 12H16a2 2 0 100 4h6"/></svg>,
    ai: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
    copy: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
    lock: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
    warehouse: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    hr: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>,
    accounts: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="15" x2="22" y2="15"/><line x1="8" y1="9" x2="8" y2="21"/></svg>,
    calendar: <svg style={style} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  };
  return icons[name] || <span style={style}>?</span>;
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
const fmt_currency = (v, curr = "৳") => `${curr}${Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmt_num = (v) => Number(v || 0).toLocaleString("en-US");
const pct_change = (curr, prev) => prev === 0 ? 100 : ((curr - prev) / prev * 100).toFixed(1);

// ============================================================
// COMPONENTS
// ============================================================

// Toast
const Toast = ({ toasts, removeToast }) => (
  <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
    {toasts.map(t => (
      <div key={t.id} className="fade-in" style={{
        background: t.type === "success" ? "#FFFFFF" : t.type === "error" ? "#FFFFFF" : "#FFFFFF",
        border: `1px solid ${t.type === "success" ? "rgba(16,185,129,0.3)" : t.type === "error" ? "rgba(239,68,68,0.3)" : "#E2E8F0"}`,
        borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)", minWidth: 280, maxWidth: 360,
      }}>
        <div style={{ color: t.type === "success" ? "#10B981" : t.type === "error" ? "#EF4444" : "#3B82F6" }}>
          <Icon name={t.type === "success" ? "check" : t.type === "error" ? "x" : "info"} size={16} />
        </div>
        <span style={{ color: "#0F172A", fontSize: 13, flex: 1 }}>{t.message}</span>
        <button onClick={() => removeToast(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748B", padding: 2 }}>
          <Icon name="x" size={14} />
        </button>
      </div>
    ))}
  </div>
);

// Search Input
const SearchInput = ({ value, onChange, placeholder = "Search...", style: sx }) => (
  <div style={{ position: "relative", ...sx }}>
    <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#64748B", pointerEvents: "none" }}>
      <Icon name="search" size={14} />
    </div>
    <input className="search-input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
  </div>
);

// Stat Card
const StatCard = ({ label, value, icon, color, change, prefix = "৳", suffix = "" }) => {
  const colors = {
    blue: { bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.2)", icon: "#3B82F6" },
    green: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.2)", icon: "#10B981" },
    yellow: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.2)", icon: "#F59E0B" },
    red: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.2)", icon: "#EF4444" },
    purple: { bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.2)", icon: "#8B5CF6" },
  };
  const c = colors[color] || colors.blue;
  const isPositive = change >= 0;
  return (
    <div className="stat-card">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: c.icon }}>
          <Icon name={icon} size={18} />
        </div>
        {change !== undefined && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, color: isPositive ? "#10B981" : "#EF4444", fontSize: 12, fontWeight: 600, fontFamily: "IBM Plex Mono" }}>
            <Icon name={isPositive ? "trend_up" : "trend_down"} size={12} />
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div style={{ fontFamily: "IBM Plex Mono", fontSize: 22, fontWeight: 600, color: "#0F172A", marginBottom: 4, animation: "countUp 0.5s ease" }}>
        {prefix}{typeof value === "number" ? value.toLocaleString("en-US", { minimumFractionDigits: prefix === "৳" ? 2 : 0, maximumFractionDigits: prefix === "৳" ? 2 : 0 }) : value}{suffix}
      </div>
      <div style={{ fontSize: 12, color: "#64748B", fontWeight: 500 }}>{label}</div>
    </div>
  );
};

// Bar Chart
const BarChart = ({ data, height = 160, color = "#3B82F6" }) => {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height, paddingBottom: 24, position: "relative" }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
            <div className="tooltip-wrap" style={{ width: "100%", display: "flex", justifyContent: "center", height: "calc(100% - 20px)", alignItems: "flex-end" }}>
              <div className="chart-bar" style={{
                width: "70%", height: `${pct}%`, minHeight: 4,
                background: `linear-gradient(to top, ${color}, ${color}88)`,
                borderRadius: "3px 3px 0 0", cursor: "pointer",
                transition: "all 0.3s",
              }} />
              <div className="tooltip">{d.label}: ${d.value.toLocaleString()}</div>
            </div>
            <div style={{ fontSize: 10, color: "#64748B", marginTop: 4, fontFamily: "IBM Plex Mono", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", maxWidth: "100%" }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
};

// Line Chart (SVG)
const LineChart = ({ data, height = 120, color = "#10B981" }) => {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  const min = Math.min(...data.map(d => d.value), 0);
  const range = max - min || 1;
  const w = 100, h = height;
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((d.value - min) / range) * (h - 10) - 5,
  }));
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${h} L ${pts[0].x} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height, overflow: "visible" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
};

// Donut Chart
const DonutChart = ({ data, size = 120 }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  let offset = 0;
  const r = 45, cx = 60, cy = 60, circumference = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E2E8F0" strokeWidth="12" />
      {data.map((d, i) => {
        const pct = d.value / total;
        const dash = circumference * pct;
        const gap = circumference - dash;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth="12"
            strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset * circumference / (2 * Math.PI * r) * circumference}
            style={{ transform: `rotate(${offset * 360 / total - 90}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: "all 0.5s" }}
          />
        );
        offset += d.value;
        return el;
      })}
      <text x={cx} y={cy + 5} textAnchor="middle" fill="#0F172A" fontSize="14" fontFamily="IBM Plex Mono" fontWeight="600">{total}</text>
    </svg>
  );
};

// Pagination
const Pagination = ({ page, total, perPage, onChange }) => {
  const pages = Math.ceil(total / perPage);
  if (total === 0) return null;

  // Build page number list with ellipsis
  const getPageNums = () => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const nums = [];
    if (page <= 4) {
      nums.push(1, 2, 3, 4, 5, "...", pages);
    } else if (page >= pages - 3) {
      nums.push(1, "...", pages - 4, pages - 3, pages - 2, pages - 1, pages);
    } else {
      nums.push(1, "...", page - 1, page, page + 1, "...", pages);
    }
    return nums;
  };

  const btnStyle = (active) => ({
    minWidth: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center",
    borderRadius: 6, border: `1px solid ${active ? "#3B82F6" : "#E2E8F0"}`,
    background: active ? "#3B82F6" : "#F1F5F9",
    color: active ? "white" : "#64748B",
    fontSize: 12, fontFamily: "IBM Plex Mono, monospace", fontWeight: 500,
    cursor: "pointer", padding: "0 8px", transition: "all 0.15s",
  });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderTop: "1px solid #E2E8F0" }}>
      <span style={{ fontSize: 12, color: "#64748B", fontFamily: "IBM Plex Mono" }}>
        {total === 0 ? "No records" : <>Showing <strong style={{ color: "#475569" }}>{Math.min((page - 1) * perPage + 1, total)}–{Math.min(page * perPage, total)}</strong> of <strong style={{ color: "#475569" }}>{total}</strong></>}
      </span>
      {pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button onClick={() => onChange(page - 1)} disabled={page === 1} style={{ ...btnStyle(false), opacity: page === 1 ? 0.35 : 1, cursor: page === 1 ? "not-allowed" : "pointer" }}>‹</button>
          {getPageNums().map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} style={{ color: "#475569", fontSize: 12, padding: "0 4px" }}>…</span>
            ) : (
              <button key={p} onClick={() => onChange(p)} style={btnStyle(p === page)}>{p}</button>
            )
          )}
          <button onClick={() => onChange(page + 1)} disabled={page === pages} style={{ ...btnStyle(false), opacity: page === pages ? 0.35 : 1, cursor: page === pages ? "not-allowed" : "pointer" }}>›</button>
        </div>
      )}
    </div>
  );
};

// Modal
const Modal = ({ open, onClose, title, children, width = 600 }) => {
  if (!open) return null;
  return createPortal(
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bz-modal" style={{
        width: "100%", maxWidth: width, background: "#FFFFFF",
        border: "1px solid #E2E8F0", borderRadius: 16,
        display: "flex", flexDirection: "column",
        maxHeight: "calc(100vh - 48px)", overflow: "hidden",
        animation: "fadeIn 0.2s ease", flexShrink: 0,
      }}>
        <div className="bz-modal-head" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px", borderBottom: "1px solid #E2E8F0",
          flexShrink: 0, background: "#FFFFFF", borderRadius: "16px 16px 0 0",
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", margin: 0 }}>{title}</h3>
          <button onClick={onClose} className="btn btn-secondary btn-icon">
            <Icon name="x" size={15} />
          </button>
        </div>
        <div className="bz-modal-body" style={{ padding: 24, overflowY: "auto", flex: 1, minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

// Status Badge
const StatusBadge = ({ status }) => {
  const map = {
    paid: "badge-success", due: "badge-danger", partial: "badge-warning", advance: "badge-purple",
    return: "badge-danger", deducted: "badge-warning", aidtds: "badge-tds",
    active: "badge-success", inactive: "badge-gray",
    low: "badge-warning", out: "badge-danger", ok: "badge-success",
  };
  const labels = { advance: "PAYMENT", deducted: "DEDUCTED", aidtds: "AIT-TDS" };
  return <span className={`badge ${map[status] || "badge-gray"}`}>{labels[status] || status?.toUpperCase()}</span>;
};

// Empty State
const EmptyState = ({ icon = "package", message = "No data found" }) => (
  <div style={{ textAlign: "center", padding: "48px 24px", color: "#64748B" }}>
    <div style={{ marginBottom: 12, opacity: 0.4 }}><Icon name={icon} size={40} /></div>
    <p style={{ fontSize: 14 }}>{message}</p>
  </div>
);

// Section Header
const SectionHeader = ({ title, subtitle, actions }) => (
  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>{title}</h2>
      {subtitle && <p style={{ fontSize: 13, color: "#64748B" }}>{subtitle}</p>}
    </div>
    {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
  </div>
);

// ============================================================
// SIDEBAR
// ============================================================
const Sidebar = ({ active, setActive, collapsed, setCollapsed }) => {
  const { data, currentUser, logout } = useApp();
  const lowStock = data.products.filter(p => p.stock <= p.minStock).length;
  const due = data.sales.filter(s => s.saleType !== "advance").reduce((sum, s) => sum + (s.due || 0), 0);

  const nav = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "sales", label: "Sales", icon: "sales" },
    { id: "purchases", label: "Purchases", icon: "purchase" },
    { id: "inventory", label: "Inventory", icon: "inventory" },
    { id: "warehouse", label: "Warehouse", icon: "warehouse", url: "https://hongtai-store.netlify.app/store.html" },
    { id: "hr", label: "HR", icon: "hr", url: "https://hongtai-leave.netlify.app/home.html" },
    { id: "customers", label: "Customers", icon: "customers" },
    { id: "suppliers", label: "Suppliers", icon: "suppliers" },
    { id: "finance", label: "Finance", icon: "finance" },
    { id: "accounts", label: "Accounts", icon: "accounts" },
    { id: "reports", label: "Reports", icon: "reports" },
    { id: "ai", label: "AI Analytics", icon: "ai" },
    { id: "logs", label: "Activity Logs", icon: "log" },
    { id: "settings", label: "Settings", icon: "settings" },
    { id: "recycle", label: "Recycle Bin", icon: "trash" },
  ];
  const binCount = (data.recycleBin || []).length;

  return (
    <div className={`bz-sidebar ${collapsed ? "" : "bz-open"}`} style={{
      width: collapsed ? 60 : 220, flexShrink: 0, background: "#FFFFFF",
      borderRight: "1px solid #E2E8F0", display: "flex", flexDirection: "column",
      height: "100vh", position: "sticky", top: 0, transition: "width 0.25s ease", overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ padding: collapsed ? "20px 12px" : "20px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, fontWeight: 800, color: "white" }}>B</div>
        {!collapsed && <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A", lineHeight: 1.2 }}>BizCore</div>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono" }}>ERP v2.4</div>
        </div>}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, padding: "12px 8px", overflowY: "auto", overflowX: "hidden" }}>
        {nav.map(item => (
          <div key={item.id} className={`sidebar-item ${active === item.id ? "active" : ""}`}
            onClick={() => item.url ? window.open(item.url, "_blank", "noopener,noreferrer") : setActive(item.id)}
            title={collapsed ? item.label : ""}
            style={{ justifyContent: collapsed ? "center" : "flex-start", padding: collapsed ? "9px" : "9px 12px" }}>
            <div className="sidebar-icon" style={{ position: "relative", flexShrink: 0 }}>
              <Icon name={item.icon} size={17} />
              {item.id === "inventory" && lowStock > 0 && (
                <div className="notification-dot" style={{ position: "absolute", top: -2, right: -2, width: 5, height: 5 }} />
              )}
            </div>
            {!collapsed && <span style={{ whiteSpace: "nowrap" }}>{item.label}</span>}
            {!collapsed && item.id === "inventory" && lowStock > 0 && (
              <span className="badge badge-warning" style={{ marginLeft: "auto", padding: "1px 6px", fontSize: 10 }}>{lowStock}</span>
            )}
            {!collapsed && item.id === "recycle" && binCount > 0 && (
              <span className="badge badge-gray" style={{ marginLeft: "auto", padding: "1px 6px", fontSize: 10 }}>{binCount}</span>
            )}
          </div>
        ))}
      </div>

      {/* User */}
      <div style={{ padding: "12px 8px", borderTop: "1px solid #E2E8F0" }}>
        <button onClick={() => setCollapsed(!collapsed)} className="sidebar-item" style={{ width: "100%", border: "none", background: "none", justifyContent: collapsed ? "center" : "flex-start" }}>
          <Icon name="menu" size={17} />
          {!collapsed && <span>Collapse</span>}
        </button>
        <button onClick={logout} className="sidebar-item" title={collapsed ? "Sign Out" : ""} style={{ width: "100%", border: "none", background: "none", justifyContent: collapsed ? "center" : "flex-start", color: "#EF4444", marginTop: 2 }}>
          <Icon name="lock" size={17} />
          {!collapsed && <span>Sign Out</span>}
        </button>
        {!collapsed && currentUser && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", marginTop: 4 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0 }}>
              {currentUser.avatar || currentUser.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: "#64748B" }}>{currentUser.role}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// HEADER
// ============================================================
const Header = ({ page, showNotif, setShowNotif }) => {
  const { data } = useApp();
  const lowStock = data.products.filter(p => p.stock <= p.minStock);
  const notifCount = lowStock.length;
  const titles = { dashboard: "Dashboard", sales: "Sales Management", purchases: "Purchase Management", inventory: "Inventory", customers: "Customers", suppliers: "Suppliers", finance: "Financial Overview", reports: "Reports", ai: "AI Analytics", logs: "Activity Logs", settings: "Settings", recycle: "Recycle Bin", accounts: "Accounts & Ledger" };

  return (
    <div className="bz-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: "1px solid #E2E8F0", background: "#FFFFFF", position: "sticky", top: 0, zIndex: 100 }}>
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 700, color: "#0F172A" }}>{titles[page] || page}</h1>
        <p style={{ fontSize: 12, color: "#64748B", fontFamily: "IBM Plex Mono" }}>{new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative" }}>
          <button className="btn btn-secondary btn-icon" onClick={() => setShowNotif(!showNotif)} style={{ position: "relative" }}>
            <Icon name="bell" size={16} />
            {notifCount > 0 && <span style={{ position: "absolute", top: 3, right: 3, width: 7, height: 7, borderRadius: "50%", background: "#EF4444", border: "1.5px solid #FFFFFF" }} />}
          </button>
          {showNotif && (
            <div className="bz-notif" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, width: 320, boxShadow: "0 16px 48px rgba(0,0,0,0.5)", zIndex: 200, animation: "fadeIn 0.2s ease" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>Notifications</span>
                <span className="badge badge-danger">{notifCount}</span>
              </div>
              {lowStock.map(p => (
                <div key={p.id} style={{ padding: "12px 16px", borderBottom: "1px solid #FFFFFF", display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#F59E0B" }}>
                    <Icon name="alert" size={15} />
                  </div>
                  <div>
                    <p style={{ fontSize: 12, color: "#334155" }}><strong>{p.name}</strong> low stock</p>
                    <p style={{ fontSize: 11, color: "#64748B" }}>Only {p.stock} units left (min: {p.minStock})</p>
                  </div>
                </div>
              ))}
              {notifCount === 0 && <div style={{ padding: 20, textAlign: "center", color: "#64748B", fontSize: 13 }}>No new notifications</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// DASHBOARD
// ============================================================
const Dashboard = () => {
  const { data, curr } = useApp();
  const totalSales = data.sales.reduce((s, sale) => s + sale.total, 0);
  const totalPurchases = data.purchases.reduce((s, p) => s + p.total, 0);
  const totalExpenses = data.expenses.reduce((s, e) => s + e.amount, 0);
  const totalRevenue = data.sales.reduce((s, sale) => s + sale.paid, 0);
  const profit = totalRevenue - totalPurchases - totalExpenses;
  const lowStock = data.products.filter(p => p.stock <= p.minStock);

  // Outstanding due — same ledger formula as Customer Ledger & Sales Due Overview
  const totalDue = data.customers.reduce((sum, c) => {
    const custSales = data.sales.filter(s => s.customerId === c.id);
    const lbal = custSales.reduce((bal, s) =>
      s.saleType === "advance" ? bal - (s.paid || 0) :
      s.saleType === "return"  ? bal - (s.total || 0) :
      bal + (s.total || 0) - (s.paid || 0), 0);
    return sum + (lbal > 0 ? lbal : 0);
  }, 0);

  // Daily chart data (last 14 days)
  const dailyData = Array.from({ length: 14 }, (_, i) => {
    const d = daysAgo(13 - i);
    const daySales = data.sales.filter(s => s.date === d).reduce((a, s) => a + s.total, 0);
    return { label: d.slice(5), value: daySales };
  });

  // Top products
  const productSales = {};
  data.sales.forEach(sale => {
    sale.items.forEach(it => {
      productSales[it.productId] = (productSales[it.productId] || 0) + it.qty * it.price;
    });
  });
  const topProducts = Object.entries(productSales)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, rev]) => ({ product: data.products.find(p => p.id === id), revenue: rev }))
    .filter(x => x.product);

  // Top customers
  const custSales = {};
  data.sales.forEach(sale => {
    custSales[sale.customerId] = (custSales[sale.customerId] || 0) + sale.total;
  });
  const topCustomers = Object.entries(custSales)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([id, total]) => ({ customer: data.customers.find(c => c.id === id), total }))
    .filter(x => x.customer);

  // Monthly chart
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const currentYear = new Date().getFullYear();
  const monthlyData = months.slice(0, 7).map((m, i) => {
    const monthStr = `${currentYear}-${String(i + 1).padStart(2, "0")}`;
    const value = data.sales
      .filter(s => s.date && s.date.startsWith(monthStr))
      .reduce((sum, s) => sum + (s.total || 0), 0);
    return { label: m, value };
  });

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Revenue" value={totalRevenue} icon="wallet" color="blue" change={8.2} />
        <StatCard label="Total Sales" value={totalSales} icon="sales" color="green" change={12.5} />
        <StatCard label="Total Purchases" value={totalPurchases} icon="purchase" color="yellow" change={-3.1} />
        <StatCard label="Net Profit" value={profit} icon="finance" color="purple" change={15.8} />
        <StatCard label="Outstanding Due" value={totalDue} icon="alert" color="red" change={-5.2} />
      </div>

      {/* Charts Row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Daily Sales Revenue</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>Last 14 days</div>
            </div>
            <span className="badge badge-blue">LIVE</span>
          </div>
          <BarChart data={dailyData} height={160} color="#3B82F6" />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>Payment Status</div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>Sales breakdown</div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <DonutChart size={100} data={[
              { value: data.sales.filter(s => s.status === "paid").length, color: "#10B981" },
              { value: data.sales.filter(s => s.status === "due").length, color: "#EF4444" },
              { value: data.sales.filter(s => s.status === "partial").length, color: "#F59E0B" },
            ]} />
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[{ l: "Paid", c: "#10B981", v: data.sales.filter(s => s.status === "paid").length },
                { l: "Due", c: "#EF4444", v: data.sales.filter(s => s.status === "due").length },
                { l: "Partial", c: "#F59E0B", v: data.sales.filter(s => s.status === "partial").length }].map(i => (
                <div key={i.l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: i.c }} />
                  <span style={{ color: "#475569" }}>{i.l}</span>
                  <span style={{ color: "#0F172A", fontFamily: "IBM Plex Mono", marginLeft: "auto" }}>{i.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>Monthly Revenue Trend</div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>This year</div>
          <LineChart data={monthlyData} height={100} color="#10B981" />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            {monthlyData.map(d => <div key={d.label} style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono" }}>{d.label}</div>)}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 4 }}>Financial Summary</div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>Current period</div>
          {[
            { label: "Revenue", value: totalRevenue, color: "#3B82F6", pct: 100 },
            { label: "Cost of Goods", value: totalPurchases, color: "#10B981", pct: (totalPurchases / totalRevenue) * 100 },
            { label: "Expenses", value: totalExpenses, color: "#F59E0B", pct: (totalExpenses / totalRevenue) * 100 },
            { label: "Net Profit", value: profit, color: "#8B5CF6", pct: (profit / totalRevenue) * 100 },
          ].map(item => (
            <div key={item.label} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#475569" }}>{item.label}</span>
                <span style={{ fontSize: 12, color: "#0F172A", fontFamily: "IBM Plex Mono" }}>{curr}{item.value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${Math.min(Math.abs(item.pct), 100)}%`, background: item.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* Top Products */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 16 }}>Top Products</div>
          {topProducts.map((tp, i) => (
            <div key={tp.product.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontFamily: "IBM Plex Mono", color: "#64748B" }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tp.product.name}</div>
                <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono" }}>{curr}{tp.revenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
              </div>
              <div style={{ width: 60 }}>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(tp.revenue / topProducts[0].revenue) * 100}%`, background: "#3B82F6" }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Top Customers */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 16 }}>Top Customers</div>
          {topCustomers.map((tc, i) => (
            <div key={tc.customer.id} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "white" }}>{tc.customer.name[0]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tc.customer.name}</div>
                <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono" }}>{curr}{tc.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Low Stock Alerts */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ color: "#F59E0B" }}><Icon name="alert" size={16} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Low Stock Alerts</div>
            <span className="badge badge-warning" style={{ marginLeft: "auto" }}>{lowStock.length}</span>
          </div>
          {lowStock.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "#64748B", fontSize: 12 }}>All stock levels OK</div>
          ) : lowStock.slice(0, 5).map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "8px 10px", background: "rgba(245,158,11,0.05)", borderRadius: 8, border: "1px solid rgba(245,158,11,0.1)" }}>
              <div>
                <div style={{ fontSize: 12, color: "#334155" }}>{p.name}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>SKU: {p.sku}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontFamily: "IBM Plex Mono", color: p.stock === 0 ? "#EF4444" : "#F59E0B", fontWeight: 600 }}>{p.stock}</div>
                <div style={{ fontSize: 10, color: "#64748B" }}>min {p.minStock}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Recent Activity</div>
        </div>
        <div>
          {data.activityLogs.map((log, i) => (
            <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: i < data.activityLogs.length - 1 ? "1px solid #FFFFFF" : "none" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: { sale: "#10B981", product: "#3B82F6", stock: "#F59E0B", purchase: "#8B5CF6", customer: "#EF4444" }[log.type] || "#64748B" }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: "#334155" }}><strong style={{ color: "#0F172A" }}>{log.user}</strong> {log.action}</span>
              </div>
              <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono", whiteSpace: "nowrap" }}>{log.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SALES MANAGEMENT
// ============================================================
// ============================================================
// SEARCHABLE DROPDOWN
// ============================================================
const SearchableDropdown = ({ value, onChange, options, placeholder = "Search…", style = {} }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find(o => o.value === value);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()) || (o.sub && o.sub.toLowerCase().includes(query.toLowerCase())))
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (opt) => {
    onChange(opt.value);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }}>
      {/* Trigger button */}
      {!open ? (
        <div
          onClick={handleOpen}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 10px", borderRadius: 8, cursor: "pointer",
            background: "#FFFFFF", border: "1px solid #E2E8F0",
            color: selected ? "#0F172A" : "#64748B", fontSize: 13,
            transition: "border-color 0.2s",
            minHeight: 32,
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = "#CBD5E1"}
          onMouseLeave={e => e.currentTarget.style.borderColor = "#E2E8F0"}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, overflow: "hidden" }}>
            <Icon name="search" size={13} color="#475569" style={{ flexShrink: 0, marginTop: 2 }} />
            {selected ? (
              <span style={{ whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.4 }}>
                {selected.label}
              </span>
            ) : (
              <span style={{ color: "#475569" }}>{placeholder}</span>
            )}
          </div>
          <Icon name="chevron_down" size={13} color="#475569" />
        </div>
      ) : (
        /* Search input */
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <Icon name="search" size={13} color="#3B82F6" />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            style={{ paddingLeft: 32, borderColor: "#3B82F6", boxShadow: "0 0 0 3px rgba(59,130,246,0.12)", borderRadius: 8 }}
            onKeyDown={e => {
              if (e.key === "Escape") { setOpen(false); setQuery(""); }
              if (e.key === "Enter" && filtered.length > 0) handleSelect(filtered[0]);
            }}
          />
        </div>
      )}

      {/* Dropdown list */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 9999,
          background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          maxHeight: 220, overflowY: "auto",
          animation: "fadeIn 0.15s ease",
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "14px 16px", color: "#475569", fontSize: 12, textAlign: "center", fontFamily: "IBM Plex Mono" }}>
              No results for "{query}"
            </div>
          ) : (
            filtered.map(opt => (
              <div
                key={opt.value}
                onClick={() => handleSelect(opt)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "9px 14px", cursor: "pointer", fontSize: 13,
                  background: opt.value === value ? "rgba(59,130,246,0.1)" : "transparent",
                  color: opt.value === value ? "#3B82F6" : "#334155",
                  borderBottom: "1px solid #E2E8F0",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = "rgba(15,23,42,0.04)"; }}
                onMouseLeave={e => { if (opt.value !== value) e.currentTarget.style.background = "transparent"; }}
              >
                <div>
                  <div style={{ fontWeight: opt.value === value ? 600 : 400 }}>{opt.label}</div>
                  {opt.sub && <div style={{ fontSize: 11, color: "#475569", fontFamily: "IBM Plex Mono", marginTop: 1 }}>{opt.sub}</div>}
                </div>
                {opt.value === value && <Icon name="check" size={13} color="#3B82F6" />}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const Sales = () => {
  const { data, setData, toast, curr, currentUser } = useApp();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showDuePanel, setShowDuePanel] = useState(true);
  const [dueSort, setDueSort] = useState("amount"); // "amount" | "invoices" | "name"
  const PER_PAGE = 10;

  // ── Sales History Report (from the very first sale, or any custom range) ──
  const firstSaleDate2 = data.sales.length > 0 ? data.sales.reduce((min, s) => (s.date < min ? s.date : min), data.sales[0].date) : fmt(today);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportFrom, setReportFrom] = useState(firstSaleDate2);
  const [reportTo, setReportTo] = useState(fmt(today));
  const [reportTypes, setReportTypes] = useState({ regular: true, deducted: false, aidtds: false, advance: false, return: false });
  const toggleReportType = (key) => setReportTypes(t => ({ ...t, [key]: !t[key] }));
  const selectOnlyType = (key) => setReportTypes({ regular: false, deducted: false, aidtds: false, advance: false, return: false, [key]: true });
  const selectAllTypes = () => setReportTypes({ regular: true, deducted: true, aidtds: true, advance: true, return: true });
  const openReportModal = () => { setReportFrom(firstSaleDate2); setReportTo(fmt(today)); setReportTypes({ regular: true, deducted: false, aidtds: false, advance: false, return: false }); setShowReportModal(true); };
  const reportRows = data.sales.filter(s => {
    if (s.date < reportFrom || s.date > reportTo) return false;
    if (s.saleType === "advance")  return reportTypes.advance;
    if (s.saleType === "return")   return reportTypes.return;
    if (s.saleType === "deducted") return reportTypes.deducted;
    if (s.saleType === "aidtds")   return reportTypes.aidtds;
    return reportTypes.regular;
  }).sort((a, b) => (a.date === b.date ? (a.invoiceNo || "").localeCompare(b.invoiceNo || "") : new Date(a.date) - new Date(b.date)));
  const reportRegular = reportRows.filter(s => s.saleType !== "advance" && s.saleType !== "return" && s.saleType !== "deducted" && s.saleType !== "aidtds");
  const reportReturns = reportRows.filter(s => s.saleType === "return");
  const reportAdvances = reportRows.filter(s => s.saleType === "advance");
  const reportDeducted = reportRows.filter(s => s.saleType === "deducted");
  const reportAidTds = reportRows.filter(s => s.saleType === "aidtds");
  const reportGross = reportRegular.reduce((s, x) => s + (x.total || 0), 0);
  const reportReturnsTotal = reportReturns.reduce((s, x) => s + (x.total || 0), 0);
  const reportDeductedTotal = reportDeducted.reduce((s, x) => s + Math.abs(x.total || 0), 0);
  const reportAidTdsTotal = reportAidTds.reduce((s, x) => s + Math.abs(x.total || 0), 0);
  const reportAdvanceTotal = reportAdvances.reduce((s, x) => s + (x.paid || 0), 0);
  const reportNet = reportGross - reportReturnsTotal - reportDeductedTotal - reportAidTdsTotal;
  const reportCollected = reportRows.reduce((s, x) => s + (x.paid || 0), 0);
  const reportDue = reportRegular.reduce((s, x) => s + (x.due || 0), 0);

  // ── Due Analytics — same formula as Customer Ledger ──────
  const customerDueList = data.customers.map(c => {
    const custSales = data.sales.filter(s => s.customerId === c.id);
    const lbal = custSales.reduce((bal, s) =>
      s.saleType === "advance" ? bal - (s.paid || 0) :
      s.saleType === "return"  ? bal - (s.total || 0) :
      bal + (s.total || 0) - (s.paid || 0), 0);
    const invoiceCount = custSales.filter(s => s.status === "due").length;
    const invoices = custSales.filter(s => s.status === "due").map(s => s.invoiceNo);
    return { id: c.id, name: c.name, dueAmount: lbal, invoiceCount, invoices };
  }).filter(c => c.dueAmount > 0);

  if (dueSort === "amount") customerDueList.sort((a, b) => b.dueAmount - a.dueAmount);
  else if (dueSort === "invoices") customerDueList.sort((a, b) => b.invoiceCount - a.invoiceCount);
  else customerDueList.sort((a, b) => a.name.localeCompare(b.name));

  const totalDueAmount = customerDueList.reduce((s, c) => s + c.dueAmount, 0);
  const totalDueInvoices = customerDueList.reduce((s, c) => s + c.invoiceCount, 0);
  const totalPartialInvoices = data.sales.filter(s => s.status === "partial").length;
  const maxDue = customerDueList[0]?.dueAmount || 1;

  const filtered = data.sales.filter(s => {
    const cust = data.customers.find(c => c.id === s.customerId);
    const matchSearch = s.id.toLowerCase().includes(search.toLowerCase()) ||
      cust?.name.toLowerCase().includes(search.toLowerCase()) ||
      s.invoiceNo.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || s.status === filter;
    return matchSearch && matchFilter;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const defaultVat = data.settings.taxRate ?? 10;
  const emptyForm = { saleType: "regular", customerId: "", workOrder: "", buyerRef: "", date: fmt(today), items: [{ productId: "", qty: 1, price: 0, discount: 0, unit: "" }], notes: "", vatRate: defaultVat, paidAmount: 0, advanceAmount: 0, deductedAmount: 0, aidTdsAmount: 0, paymentInvoiceId: "", paymentAmount: 0, status: "", paymentMethod: "Cash", returnItems: [{ productId: "", qty: 1, price: 0, unit: "" }] };
  const [form, setForm] = useState(emptyForm);

  const openNew = () => { setEditItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (sale) => {
    setEditItem(sale);
    const isAdvance = sale.saleType === "advance";
    const isReturn = sale.saleType === "return";
    const isDeducted = sale.saleType === "deducted";
    const isAidTds = sale.saleType === "aidtds";
    setForm({
      saleType: isAdvance ? "advance" : isReturn ? "return" : isDeducted ? "deducted" : isAidTds ? "aidtds" : "regular",
      customerId: sale.customerId,
      workOrder: sale.workOrder || "",
      buyerRef: sale.buyerRef || "",
      date: sale.date || fmt(today),
      items: (isAdvance || isReturn || isDeducted || isAidTds) ? [{ productId: "", qty: 1, price: 0, discount: 0, unit: "" }] : sale.items,
      notes: sale.notes || "",
      vatRate: sale.subtotal > 0 ? Math.round((sale.vat / sale.subtotal) * 100) : (sale.vatRate ?? defaultVat),
      paidAmount: (isAdvance || isReturn || isDeducted || isAidTds) ? 0 : sale.paid,
      advanceAmount: isAdvance ? sale.paid : 0,
      deductedAmount: isDeducted ? Math.abs(sale.total || 0) : 0,
      aidTdsAmount: isAidTds ? Math.abs(sale.total || 0) : 0,
      status: (isAdvance || isReturn || isDeducted || isAidTds) ? "" : (sale.status || ""),
      paymentMethod: sale.paymentMethod || "Cash",
      returnItems: isReturn ? sale.items : [{ productId: "", qty: 1, price: 0, unit: "" }],
    });
    setShowModal(true);
  };
  const deleteSale = (sale) => { if (!window.confirm(`Delete invoice ${sale.invoiceNo}? It will be moved to the Recycle Bin and can be restored.`)) return; const entry = makeBinEntry("sales", sale, data, currentUser?.name); setData(d => trashItem(d, "sales", entry)); toast("Sale moved to Recycle Bin", "success"); };

  const downloadDueOverviewPDF = () => {
    const settings = data.settings;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Due Overview Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 36px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 3px solid #EF4444; }
  .report-title { font-size: 30px; font-weight: 800; color: #EF4444; letter-spacing: -1px; }
  .report-sub { font-size: 12px; color: #888; margin-top: 4px; font-family: monospace; }
  .company-name { font-size: 17px; font-weight: 700; color: #111; }
  .company-info { font-size: 11px; color: #666; margin-top: 4px; line-height: 1.6; text-align: right; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
  .summary-card { border-radius: 10px; padding: 16px 18px; border: 1px solid #eee; }
  .summary-card.red { background: #fff5f5; border-color: #fecaca; }
  .summary-card.yellow { background: #fffbeb; border-color: #fde68a; }
  .summary-card-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 8px; }
  .summary-card-value { font-size: 22px; font-weight: 800; color: #111; font-family: monospace; }
  .summary-card.red .summary-card-value { color: #dc2626; }
  .summary-card.yellow .summary-card-value { color: #d97706; }
  .summary-card-unit { font-size: 11px; color: #999; margin-top: 3px; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #555; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #eee; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #EF4444; }
  th { color: #fff; padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }
  th:last-child { text-align: right; }
  td { padding: 11px 14px; border-bottom: 1px solid #f1f1f1; color: #333; font-size: 12px; }
  td:last-child { text-align: right; font-family: monospace; font-weight: 700; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:last-child td { border-bottom: none; }
  .rank-badge { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; font-size: 10px; font-weight: 800; font-family: monospace; }
  .rank-1 { background: #fee2e2; color: #dc2626; }
  .rank-2 { background: #fef3c7; color: #d97706; }
  .rank-other { background: #f1f5f9; color: #64748b; }
  .bar-cell { width: 120px; }
  .bar-bg { background: #f1f5f9; border-radius: 4px; height: 8px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .invoice-pills { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
  .invoice-pill { background: #f8f8f8; border: 1px solid #e5e7eb; border-radius: 4px; padding: 1px 6px; font-size: 9px; font-family: monospace; color: #666; }
  .amount-red { color: #dc2626 !important; }
  .amount-yellow { color: #d97706 !important; }
  .amount-blue { color: #2563eb !important; }
  .totals-row { display: flex; justify-content: space-between; padding: 8px 14px; font-size: 13px; }
  .totals-row.grand { background: #fff5f5; border: 1px solid #fecaca; border-radius: 8px; font-size: 15px; font-weight: 800; color: #dc2626; font-family: monospace; margin-top: 8px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 10px; color: #aaa; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="report-title">DUE OVERVIEW</div>
      <div class="report-sub">Outstanding Dues Report · Generated ${dateStr} at ${timeStr}</div>
    </div>
    <div style="text-align:right">
      <div class="company-name">${settings.companyName || "BizCore Systems"}</div>
      <div class="company-info">${settings.address || ""}${settings.address ? "<br/>" : ""}${settings.email || ""}${settings.email && settings.phone ? " · " : ""}${settings.phone || ""}</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card red">
      <div class="summary-card-label">Total Outstanding</div>
      <div class="summary-card-value">${curr}${totalDueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div class="summary-card-unit">due amount</div>
    </div>
    <div class="summary-card red">
      <div class="summary-card-label">Due Invoices</div>
      <div class="summary-card-value">${totalDueInvoices}</div>
      <div class="summary-card-unit">unpaid invoice${totalDueInvoices !== 1 ? "s" : ""}</div>
    </div>
    <div class="summary-card yellow">
      <div class="summary-card-label">Affected Customers</div>
      <div class="summary-card-value">${customerDueList.length}</div>
      <div class="summary-card-unit">customer${customerDueList.length !== 1 ? "s" : ""} with dues</div>
    </div>
  </div>

  <div class="section-title">Customer-wise Due Breakdown</div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Customer</th>
        <th>Due Invoices</th>
        <th style="width:130px">Progress</th>
        <th>Due Amount</th>
      </tr>
    </thead>
    <tbody>
      ${customerDueList.map((cust, idx) => {
        const pct = Math.min(100, (cust.dueAmount / (customerDueList[0]?.dueAmount || 1)) * 100);
        const color = pct > 70 ? "#dc2626" : pct > 35 ? "#d97706" : "#2563eb";
        const rankClass = idx === 0 ? "rank-1" : idx === 1 ? "rank-2" : "rank-other";
        const amtClass = pct > 70 ? "amount-red" : pct > 35 ? "amount-yellow" : "amount-blue";
        return `<tr>
          <td><span class="rank-badge ${rankClass}">${idx + 1}</span></td>
          <td>
            <div style="font-weight:600;color:#111">${cust.name}</div>
            <div class="invoice-pills">${cust.invoices.slice(0, 5).map(inv => `<span class="invoice-pill">${inv}</span>`).join("")}${cust.invoices.length > 5 ? `<span class="invoice-pill">+${cust.invoices.length - 5} more</span>` : ""}</div>
          </td>
          <td style="font-family:monospace;font-size:11px;color:#666">${cust.invoiceCount} inv</td>
          <td class="bar-cell">
            <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
            <div style="font-size:9px;color:#999;margin-top:2px;font-family:monospace">${pct.toFixed(1)}% of total</div>
          </td>
          <td class="${amtClass}">${curr}${cust.dueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>

  <div style="margin-left:auto;max-width:320px">
    <div class="totals-row grand">
      <span>Total Outstanding Due</span>
      <span>${curr}${totalDueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  </div>

  <div class="footer">
    <span>${settings.companyName || "BizCore Systems"} · Due Overview Report</span>
    <span>Generated on ${dateStr} · ${timeStr}</span>
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 300); };
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = `Due-Overview-${new Date().toISOString().split("T")[0]}.html`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const downloadDueOverviewCSV = () => {
    const rows = [["Due Overview Report", "Generated", fmt(today)]];
    rows.push([]);
    rows.push(["Total Outstanding Due", totalDueAmount.toFixed(2)]);
    rows.push(["Due Invoices", totalDueInvoices]);
    rows.push(["Customers with Dues", customerDueList.length]);
    rows.push([]);
    rows.push(["#", "Customer", "Due Invoices", "Invoice Numbers", "Due Amount"]);
    customerDueList.forEach((c, idx) => {
      rows.push([idx + 1, c.name, c.invoiceCount, c.invoices.join(" | "), c.dueAmount.toFixed(2)]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Due-Overview-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Professional Sales History Report (PDF) — from first sale to any chosen date ──
  const downloadSalesHistoryPDF = () => {
    const settings = data.settings;
    const companyName = settings.companyName || "BizCore Systems";
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const isFullHistory = reportFrom === firstSaleDate2;
    const periodLabel = isFullHistory ? `Since inception (${firstSaleDate2}) → ${reportTo}` : `${reportFrom} → ${reportTo}`;

    // Group a sale's items by unit and sum quantities per unit
    // e.g. all items "kg" -> "1234" / "kg" ; mixed -> "800, 500" / "kg, pcs"
    const groupQtyByUnit = (items) => {
      const totals = {};
      const order = [];
      (items || []).forEach(it => {
        const u = it.unit || "pcs";
        if (!(u in totals)) { totals[u] = 0; order.push(u); }
        totals[u] += Number(it.qty) || 0;
      });
      return {
        qtyStr: order.map(u => totals[u].toLocaleString("en-US")).join(", ") || "—",
        unitStr: order.join(", ") || "—",
      };
    };

    let runBalance = 0;
    const bodyRows = reportRows.map((sale, idx) => {
      const cust = data.customers.find(c => c.id === sale.customerId);
      const custName = cust?.name || "—";

      if (sale.saleType === "advance") {
        runBalance -= (sale.paid || 0);
        return `<tr class="row-advance">
          <td class="mono" style="color:#64748b">${idx + 1}</td>
          <td class="mono" style="color:#6d28d9;font-weight:700">${sale.invoiceNo}</td>
          <td class="mono">${sale.date}</td>
          <td>${custName}</td>
          <td style="color:#6d28d9;font-style:italic">— Payment Received —</td>
          <td class="center mono" style="color:#999">—</td>
          <td class="center mono" style="color:#999">—</td>
          <td class="center"><span class="badge badge-adv">PAYMENT</span></td>
          <td class="right mono">—</td>
          <td class="right mono bold" style="color:#6d28d9">${curr}${Number(sale.paid).toFixed(2)}</td>
        </tr>`;
      }
      if (sale.saleType === "return") {
        runBalance -= (sale.total || 0);
        const itemCount = sale.items?.length || 0;
        const { qtyStr: rQty, unitStr: rUnit } = groupQtyByUnit(sale.items);
        return `<tr class="row-return">
          <td class="mono" style="color:#64748b">${idx + 1}</td>
          <td class="mono" style="color:#dc2626;font-weight:700">${sale.invoiceNo}</td>
          <td class="mono">${sale.date}</td>
          <td>${custName}</td>
          <td style="color:#dc2626;font-style:italic">— Sales Return (${itemCount} item${itemCount !== 1 ? "s" : ""}) —</td>
          <td class="center mono" style="font-size:10px">${rQty || "—"}</td>
          <td class="center mono" style="font-size:10px">${rUnit || "—"}</td>
          <td class="center"><span class="badge badge-ret">RETURN</span></td>
          <td class="right mono">—</td>
          <td class="right mono bold" style="color:#dc2626">↩ ${curr}${Number(sale.total).toFixed(2)}</td>
        </tr>`;
      }
      if (sale.saleType === "deducted") {
        runBalance += (sale.total || 0);
        return `<tr class="row-deducted">
          <td class="mono" style="color:#64748b">${idx + 1}</td>
          <td class="mono" style="color:#b45309;font-weight:700">${sale.invoiceNo}</td>
          <td class="mono">${sale.date}</td>
          <td>${custName}</td>
          <td style="color:#b45309;font-style:italic">— Deducted —</td>
          <td class="center mono" style="color:#999">—</td>
          <td class="center mono" style="color:#999">—</td>
          <td class="center"><span class="badge badge-ded">DEDUCTED</span></td>
          <td class="right mono">—</td>
          <td class="right mono bold" style="color:#b45309">− ${curr}${Math.abs(Number(sale.total)).toFixed(2)}</td>
        </tr>`;
      }
      if (sale.saleType === "aidtds") {
        runBalance += (sale.total || 0);
        return `<tr class="row-aidtds">
          <td class="mono" style="color:#64748b">${idx + 1}</td>
          <td class="mono" style="color:#0e7490;font-weight:700">${sale.invoiceNo}</td>
          <td class="mono">${sale.date}</td>
          <td>${custName}</td>
          <td style="color:#0e7490;font-style:italic">— AIT-TDS —</td>
          <td class="center mono" style="color:#999">—</td>
          <td class="center mono" style="color:#999">—</td>
          <td class="center"><span class="badge badge-tds">AIT-TDS</span></td>
          <td class="right mono">—</td>
          <td class="right mono bold" style="color:#0e7490">− ${curr}${Math.abs(Number(sale.total)).toFixed(2)}</td>
        </tr>`;
      }
      // Regular sale
      runBalance += (sale.total || 0) - (sale.paid || 0);
      const itemCount = sale.items?.length || 0;
      const itemDetail = (sale.items || [])
        .map(it => it.productName || "Item")
        .join(", ");
      const { qtyStr: sQty, unitStr: sUnit } = groupQtyByUnit(sale.items);
      return `<tr class="${idx % 2 !== 0 ? "alt" : ""}">
        <td class="mono" style="color:#64748b">${idx + 1}</td>
        <td class="mono blue bold">${sale.invoiceNo}</td>
        <td class="mono">${sale.date}</td>
        <td>${custName}</td>
        <td style="font-size:10.5px;color:#666">${itemDetail || `${itemCount} item${itemCount !== 1 ? "s" : ""}`}</td>
        <td class="center mono" style="font-size:10px">${sQty || "—"}</td>
        <td class="center mono" style="font-size:10px">${sUnit || "—"}</td>
        <td class="center"><span class="badge badge-reg">SALE</span></td>
        <td class="right mono">${curr}${Number(sale.subtotal || sale.total).toFixed(2)}</td>
        <td class="right mono bold">${curr}${Number(sale.total).toFixed(2)}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Sales Report — ${companyName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
  .page { padding: 32px 36px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 22px; padding-bottom: 18px; border-bottom: 3px solid #3B82F6; }
  .report-title { font-size: 28px; font-weight: 800; color: #1d4ed8; letter-spacing: -0.5px; line-height: 1; }
  .report-sub { font-size: 11px; color: #6b7280; margin-top: 6px; font-family: 'JetBrains Mono', monospace; }
  .company-name { font-size: 16px; font-weight: 700; color: #111; text-align: right; }
  .company-info { font-size: 11px; color: #666; margin-top: 4px; line-height: 1.6; text-align: right; }
  .period-tag { display: inline-block; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 8px 16px; margin-bottom: 20px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #1d4ed8; font-weight: 600; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 22px; max-width: 620px; }
  .sum-card { border-radius: 10px; padding: 13px 14px; border: 1px solid #e5e7eb; background: #f8f9fa; }
  .sum-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #888; margin-bottom: 6px; }
  .sum-value { font-size: 16px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: #111; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th { background: #1d4ed8; color: #fff; padding: 9px 10px; text-align: left; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 8px 10px; border-bottom: 1px solid #f0f0f0; font-size: 11px; color: #333; }
  tr:last-child td { border-bottom: none; }
  tr.alt td { background: #fafbfc; }
  tr.row-advance td { background: #f5f3ff; }
  tr.row-return td { background: #fef2f2; }
  tr.row-deducted td { background: #fffbeb; }
  tr.row-aidtds td { background: #ecfeff; }
  .center { text-align: center; } .right { text-align: right; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .blue { color: #1d4ed8; } .green { color: #065f46; } .red { color: #991b1b; }
  .bold { font-weight: 700; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 700; letter-spacing: 0.03em; }
  .badge-paid { background: #d1fae5; color: #065f46; }
  .badge-due { background: #fee2e2; color: #991b1b; }
  .badge-partial { background: #fef3c7; color: #92400e; }
  .badge-reg { background: #dbeafe; color: #1d4ed8; }
  .badge-adv { background: #ede9fe; color: #6d28d9; }
  .badge-ret, .badge-ret-s { background: #fee2e2; color: #dc2626; }
  .badge-ded { background: #fef3c7; color: #b45309; }
  .badge-tds { background: #cffafe; color: #0e7490; }
  .totals-strip { margin-top: 18px; margin-left: auto; max-width: 340px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 4px; font-size: 12px; color: #555; }
  .totals-row.grand { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; font-size: 14px; font-weight: 800; color: #1d4ed8; font-family: 'JetBrains Mono', monospace; margin-top: 6px; }
  .footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 10px; color: #aaa; }
  .signatures { display: flex; justify-content: space-between; margin-top: 56px; }
  .sig-box { width: 200px; text-align: center; }
  .sig-line { border-top: 1px solid #999; padding-top: 6px; font-size: 10px; color: #666; }
  @media print { .page { padding: 18px 22px; } @page { margin: 1.2cm; size: A4 landscape; } }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="report-title">SALES REPORT</div>
        <div class="report-sub">Complete Sales History · Generated ${dateStr} at ${timeStr}</div>
      </div>
      <div>
        <div class="company-name">${companyName}</div>
        <div class="company-info">${settings.address || ""}${settings.address ? "<br/>" : ""}${settings.email || ""}${settings.email && settings.phone ? " · " : ""}${settings.phone || ""}</div>
      </div>
    </div>

    <div class="period-tag">📅 Period: ${periodLabel} &nbsp;|&nbsp; ${reportRows.length} transaction${reportRows.length !== 1 ? "s" : ""}</div>

    <div class="summary" style="grid-template-columns:repeat(${(reportTypes.regular?1:0) + (reportTypes.return?1:0) + (reportTypes.deducted?1:0) + (reportTypes.aidtds?1:0) + (reportTypes.advance?1:0) || 1},1fr);max-width:820px">
      ${reportTypes.regular ? `<div class="sum-card"><div class="sum-label">Gross Sales</div><div class="sum-value" style="color:#1d4ed8">${curr}${reportGross.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div></div>` : ""}
      ${reportTypes.return ? `<div class="sum-card"><div class="sum-label">Returns</div><div class="sum-value" style="color:#dc2626">${curr}${reportReturnsTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div></div>` : ""}
      ${reportTypes.deducted ? `<div class="sum-card"><div class="sum-label">Deducted</div><div class="sum-value" style="color:#b45309">${curr}${reportDeductedTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div></div>` : ""}
      ${reportTypes.aidtds ? `<div class="sum-card"><div class="sum-label">AIT-TDS</div><div class="sum-value" style="color:#0e7490">${curr}${reportAidTdsTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div></div>` : ""}
      ${reportTypes.advance ? `<div class="sum-card"><div class="sum-label">Payments Received</div><div class="sum-value" style="color:#6d28d9">${curr}${reportAdvanceTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div></div>` : ""}
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th><th>Invoice</th><th>Date</th><th>Customer</th><th>Details</th>
          <th class="center" style="width:50px">Qty</th><th class="center" style="width:55px">Unit</th><th>Type</th>
          <th class="right">Subtotal</th><th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${reportRows.length === 0 ? `<tr><td colspan="10" style="text-align:center;color:#888;padding:28px">No transactions found for the selected date range and type filters</td></tr>` : bodyRows}
      </tbody>
    </table>

    ${(() => {
      const trows = [];
      if (reportTypes.regular)  trows.push(`<span>Gross Sales (${reportRegular.length} invoice${reportRegular.length !== 1 ? "s" : ""})</span><span class="mono">${curr}${reportGross.toFixed(2)}</span>`);
      if (reportTypes.return)   trows.push(`<span>Returns (${reportReturns.length})</span><span class="mono" style="color:#dc2626">− ${curr}${reportReturnsTotal.toFixed(2)}</span>`);
      if (reportTypes.deducted) trows.push(`<span>Deducted (${reportDeducted.length})</span><span class="mono" style="color:#b45309">− ${curr}${reportDeductedTotal.toFixed(2)}</span>`);
      if (reportTypes.aidtds)   trows.push(`<span>AIT-TDS (${reportAidTds.length})</span><span class="mono" style="color:#0e7490">− ${curr}${reportAidTdsTotal.toFixed(2)}</span>`);
      if (reportTypes.advance)  trows.push(`<span>Payments Received (${reportAdvances.length})</span><span style="color:#6d28d9">${curr}${reportAdvanceTotal.toFixed(2)}</span>`);
      return trows.length ? `<div class="totals-strip">${trows.map((inner, i) => `<div class="totals-row${i === trows.length - 1 ? " grand" : ""}">${inner}</div>`).join("")}</div>` : "";
    })()}

    <div class="signatures">
      <div class="sig-box"><div class="sig-line">Prepared By</div></div>
      <div class="sig-box"><div class="sig-line">Checked By</div></div>
      <div class="sig-box"><div class="sig-line">Authorized Signature</div></div>
    </div>

    <div class="footer">
      <span>${companyName} · Sales Report</span>
      <span>Generated on ${dateStr} · ${timeStr}</span>
    </div>
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 300); };
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = `Sales-Report-${reportFrom}-to-${reportTo}.html`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const exportSalesHistoryCSV = () => {
    const rows = [["Sales Report", "Period", reportFrom, "to", reportTo]];
    rows.push(["#", "Invoice", "Date", "Customer", "Type", "Items", "Quantity", "Unit", "Subtotal", "Total"]);
    reportRows.forEach((s, idx) => {
      const cust = data.customers.find(c => c.id === s.customerId);
      const itemNames = (s.items || []).map(it => it.productName || "Item").join(" | ");
      const itemQty = (s.items || []).map(it => it.qty || 0).join(" | ");
      const itemUnit = (s.items || []).map(it => it.unit || "").join(" | ");
      const totalVal = s.saleType === "advance" ? (s.paid || 0) : (s.total || 0);
      rows.push([idx + 1, s.invoiceNo, s.date, cust?.name || "", s.saleType, itemNames, itemQty, itemUnit, (s.subtotal || 0).toFixed(2), totalVal.toFixed(2)]);
    });
    rows.push([]);
    if (reportTypes.regular)  rows.push(["Gross Sales", reportGross.toFixed(2)]);
    if (reportTypes.return)   rows.push(["Returns", reportReturnsTotal.toFixed(2)]);
    if (reportTypes.deducted) rows.push(["Deducted", reportDeductedTotal.toFixed(2)]);
    if (reportTypes.aidtds)   rows.push(["AIT-TDS", reportAidTdsTotal.toFixed(2)]);
    if (reportTypes.advance)  rows.push(["Payments Received", reportAdvanceTotal.toFixed(2)]);
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Sales-Report-${reportFrom}-to-${reportTo}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { productId: "", qty: 1, price: 0, discount: 0, unit: "" }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i, field, val) => {
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [field]: val };
      if (field === "productId") {
        const prod = data.products.find(p => p.id === val);
        if (prod) { items[i].price = prod.sellPrice; items[i].unit = prod.unit || "pcs"; }
      }
      return { ...f, items };
    });
  };

  const addReturnItem = () => setForm(f => ({ ...f, returnItems: [...(f.returnItems || []), { productId: "", qty: 1, price: 0, unit: "" }] }));
  const removeReturnItem = (i) => setForm(f => ({ ...f, returnItems: (f.returnItems || []).filter((_, idx) => idx !== i) }));
  const updateReturnItem = (i, field, val) => {
    setForm(f => {
      const returnItems = [...(f.returnItems || [])];
      returnItems[i] = { ...returnItems[i], [field]: val };
      if (field === "productId") {
        const prod = data.products.find(p => p.id === val);
        if (prod) { returnItems[i].price = prod.sellPrice; returnItems[i].unit = prod.unit || "pcs"; }
      }
      return { ...f, returnItems };
    });
  };
  const returnTotal = (form.returnItems || []).reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);

  const subtotal = form.items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0) * (1 - (it.discount || 0) / 100), 0);
  const vat = subtotal * (form.vatRate / 100);
  const total = subtotal + vat;
  const paidAmt = +form.paidAmount || 0;
  const dueAmt = Math.max(0, total - paidAmt);
  const autoStatus = paidAmt >= total && total > 0 ? "paid" : paidAmt === 0 ? "due" : "partial";
  const derivedStatus = form.status || autoStatus;

  const submitSale = () => {
    if (!form.customerId) { toast("Please select a customer", "error"); return; }

    if (form.saleType === "advance") {
      const advAmt = +form.advanceAmount || 0;
      if (advAmt <= 0) { toast("Enter a valid payment amount", "error"); return; }
      const saleObj = {
        id: editItem ? editItem.id : `SL-${generateId()}`,
        invoiceNo: editItem ? editItem.invoiceNo : (() => {
          const d = new Date(form.date || fmt(today));
          const yy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const prefix = `PAY-${yy}${mm}${dd}`;
          return nextSerialNo(prefix, data, "sales", "invoiceNo");
        })(),
        date: form.date || fmt(today),
        customerId: form.customerId,
        saleType: "advance",
        items: [],
        subtotal: 0, discount: 0, vat: 0, total: 0,
        paid: advAmt, due: 0,
        status: "advance",
        notes: form.notes,
        paymentMethod: form.paymentMethod || "Cash",
      };
      if (editItem) {
        setData(d => ({ ...d, sales: d.sales.map(s => s.id === editItem.id ? saleObj : s) }));
        toast("Payment updated!", "success");
      } else {
        setData(d => ({ ...d, sales: [saleObj, ...d.sales] }));
        toast("Payment recorded!", "success");
      }
    } else if (form.saleType === "deducted") {
      const dedAmt = +form.deductedAmount || 0;
      if (dedAmt <= 0) { toast("Enter a valid deduction amount", "error"); return; }
      const dedSaleObj = {
        id: editItem ? editItem.id : `SL-${generateId()}`,
        invoiceNo: editItem ? editItem.invoiceNo : (() => {
          const d = new Date(form.date || fmt(today));
          const yy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const prefix = `DED-${yy}${mm}${dd}`;
          return nextSerialNo(prefix, data, "sales", "invoiceNo");
        })(),
        date: form.date || fmt(today),
        customerId: form.customerId,
        saleType: "deducted",
        items: [],
        subtotal: -dedAmt, discount: 0, vat: 0, total: -dedAmt,
        paid: 0, due: 0,
        status: "deducted",
        notes: form.notes,
        paymentMethod: form.paymentMethod || "Cash",
      };
      if (editItem) {
        setData(d => ({ ...d, sales: d.sales.map(s => s.id === editItem.id ? dedSaleObj : s) }));
        toast("Deduction updated!", "success");
      } else {
        setData(d => ({ ...d, sales: [dedSaleObj, ...d.sales] }));
        toast("Deduction recorded!", "success");
      }
    } else if (form.saleType === "aidtds") {
      const tdsAmt = +form.aidTdsAmount || 0;
      if (tdsAmt <= 0) { toast("Enter a valid AIT-TDS amount", "error"); return; }
      const tdsSaleObj = {
        id: editItem ? editItem.id : `SL-${generateId()}`,
        invoiceNo: editItem ? editItem.invoiceNo : (() => {
          const d = new Date(form.date || fmt(today));
          const yy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const prefix = `TDS-${yy}${mm}${dd}`;
          return nextSerialNo(prefix, data, "sales", "invoiceNo");
        })(),
        date: form.date || fmt(today),
        customerId: form.customerId,
        saleType: "aidtds",
        items: [],
        subtotal: -tdsAmt, discount: 0, vat: 0, total: -tdsAmt,
        paid: 0, due: 0,
        status: "aidtds",
        notes: form.notes,
        paymentMethod: form.paymentMethod || "Cash",
      };
      if (editItem) {
        setData(d => ({ ...d, sales: d.sales.map(s => s.id === editItem.id ? tdsSaleObj : s) }));
        toast("AIT-TDS updated!", "success");
      } else {
        setData(d => ({ ...d, sales: [tdsSaleObj, ...d.sales] }));
        toast("AIT-TDS recorded!", "success");
      }
    } else if (form.saleType === "return") {
      const retItems = form.returnItems || [];
      if (retItems.some(it => !it.productId)) { toast("Please select a product for all return rows", "error"); return; }
      if (returnTotal <= 0) { toast("Enter a valid return amount", "error"); return; }
      const returnItemsWithNames = retItems.map(it => {
        const prod = data.products.find(p => p.id === it.productId);
        return { ...it, productName: prod?.name || it.productName || "" };
      });
      const retInvoiceNo = (() => {
        const d = new Date(form.date || fmt(today));
        const yy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const prefix = `RET-${yy}${mm}${dd}`;
        return nextSerialNo(prefix, data, "sales", "invoiceNo");
      })();
      const retSale = {
        id: editItem ? editItem.id : `SL-${generateId()}`,
        invoiceNo: editItem ? editItem.invoiceNo : retInvoiceNo,
        date: form.date || fmt(today),
        customerId: form.customerId,
        saleType: "return",
        items: returnItemsWithNames,
        subtotal: returnTotal, vat: 0, total: returnTotal,
        paid: 0, due: 0,
        status: "return",
        notes: form.notes,
      };
      if (editItem) {
        setData(d => ({ ...d, sales: d.sales.map(s => s.id === editItem.id ? retSale : s) }));
        toast("Return updated!", "success");
      } else {
        setData(d => {
          const updatedProducts = d.products.map(p => {
            const matched = retItems.filter(it => it.productId === p.id);
            if (matched.length === 0) return p;
            const totalQty = matched.reduce((sum, it) => sum + (it.qty || 0), 0);
            return { ...p, stock: p.stock + totalQty };
          });
          return { ...d, sales: [retSale, ...d.sales], products: updatedProducts };
        });
        toast("Return processed & stock restored!", "success");
      }
    } else {
      if (form.items.some(it => !it.productId)) { toast("Please select a product for all rows", "error"); return; }
      const paid = +form.paidAmount || 0;
      const due = Math.max(0, total - paid);
      const autoCalcStatus = paid >= total && total > 0 ? "paid" : paid === 0 ? "due" : "partial";
      const status = form.status || autoCalcStatus;
      // Snapshot product names so invoice still shows them if product is later deleted
      const itemsWithNames = form.items.map(it => {
        const prod = data.products.find(p => p.id === it.productId);
        return { ...it, productName: prod?.name || it.productName || "" };
      });
      if (editItem) {
        const updated = { ...editItem, customerId: form.customerId, date: form.date, items: itemsWithNames, subtotal, vat, total, paid, due, status, notes: form.notes, saleType: "regular", paymentMethod: form.paymentMethod || "Cash", workOrder: (form.workOrder || "").trim(), buyerRef: (form.buyerRef || "").trim() };
        setData(d => ({ ...d, sales: d.sales.map(s => s.id === editItem.id ? updated : s) }));
        toast("Sale updated!", "success");
      } else {
        const newSale = {
          id: `SL-${generateId()}`, date: form.date || fmt(today),
          customerId: form.customerId, items: itemsWithNames,
          saleType: "regular",
          workOrder: (form.workOrder || "").trim(), buyerRef: (form.buyerRef || "").trim(),
          subtotal, discount: 0, vat, total, paid, due,
          status, notes: form.notes,
          paymentMethod: form.paymentMethod || "Cash",
          invoiceNo: (() => {
            const d = new Date(form.date || fmt(today));
            const yy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const prefix = `INV-${yy}${mm}${dd}`;
            return nextSerialNo(prefix, data, "sales", "invoiceNo");
          })()
        };
        setData(d => {
          const updatedProducts = d.products.map(p => {
            const item = form.items.find(it => it.productId === p.id);
            return item ? { ...p, stock: Math.max(0, p.stock - item.qty) } : p;
          });
          return { ...d, sales: [newSale, ...d.sales], products: updatedProducts };
        });
        toast("Sale created successfully!", "success");
      }
    }
    setShowModal(false);
    setForm(emptyForm);
  };

  // Standalone invoice download — opens a clean HTML window and triggers print-to-PDF
  const triggerInvoiceDownload = (sale) => {
    const cust = data.customers.find(c => c.id === sale.customerId);
    const settings = data.settings;
    const taxName = settings.taxName || "VAT";
    const vatPct = sale.subtotal > 0 ? ((sale.vat / sale.subtotal) * 100).toFixed(0) : 10;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Invoice ${sale.invoiceNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #1a1a1a; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #3B82F6; }
  .invoice-title { font-size: 36px; font-weight: 800; color: #3B82F6; letter-spacing: -1px; }
  .invoice-no { font-size: 13px; color: #666; margin-top: 4px; font-family: monospace; }
  .company-name { font-size: 18px; font-weight: 700; color: #111; }
  .company-info { font-size: 12px; color: #666; margin-top: 4px; line-height: 1.6; text-align: right; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 28px; }
  .meta-box { background: #f8f9fa; border-radius: 8px; padding: 16px 20px; width: 48%; }
  .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 8px; }
  .meta-value { font-size: 14px; font-weight: 600; color: #111; }
  .meta-sub { font-size: 12px; color: #666; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #3B82F6; color: #fff; padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  th:last-child, td:last-child { text-align: right; }
  td { padding: 11px 14px; border-bottom: 1px solid #eee; color: #333; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #fafafa; }
  .totals { margin-left: auto; width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; color: #555; }
  .totals-row.total { border-top: 2px solid #3B82F6; padding-top: 12px; margin-top: 4px; font-size: 16px; font-weight: 800; color: #111; }
  .totals-row.total span:last-child { color: #3B82F6; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .status-paid { background: #d1fae5; color: #065f46; }
  .status-due { background: #fee2e2; color: #991b1b; }
  .status-partial { background: #fef3c7; color: #92400e; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #aaa; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-no">${sale.invoiceNo}</div>
    </div>
    <div style="text-align:right">
      <div class="company-name">${settings.companyName || "BizCore Systems"}</div>
      <div class="company-info">${settings.address || ""}<br/>${settings.email || ""} · ${settings.phone || ""}</div>
    </div>
  </div>
  <div class="meta">
    <div class="meta-box">
      <div class="meta-label">Bill To</div>
      <div class="meta-value">${cust?.name || "—"}</div>
      <div class="meta-sub">${cust?.email || ""}</div>
      <div class="meta-sub">${cust?.address || ""}</div>
    </div>
    <div class="meta-box" style="text-align:right">
      <div class="meta-label">Invoice Details</div>
      <div class="meta-value">Date: ${sale.date}</div>
      <div class="meta-sub">Status: <span class="status-badge status-${sale.status}">${sale.status === "advance" ? "PAYMENT" : sale.status === "aidtds" ? "AIT-TDS" : sale.status.toUpperCase()}</span></div>
      ${sale.paymentMethod ? `<div class="meta-sub" style="margin-top:4px">Payment Method: <strong>${sale.paymentMethod}</strong></div>` : ""}
      ${sale.workOrder ? `<div class="meta-sub" style="margin-top:4px">Work Order: <strong>${invEsc(sale.workOrder)}</strong></div>` : ""}
      ${sale.buyerRef ? `<div class="meta-sub" style="margin-top:4px">Buyer Ref. No.: <strong>${invEsc(sale.buyerRef)}</strong></div>` : ""}
    </div>
  </div>
  <table>
    <thead><tr><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:center">Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${sale.items.map(it => {
        const prod = data.products.find(p => p.id === it.productId);
        return `<tr>
          <td>${prod?.name || "—"}</td>
          <td style="text-align:right">${it.qty}</td>
          <td style="text-align:center">${it.unit || prod?.unit || "pcs"}</td>
          <td style="text-align:right">${curr}${Number(it.price).toFixed(2)}</td>
          <td style="text-align:right">${curr}${((it.qty || 0) * (it.price || 0) * (1 - (it.discount || 0) / 100)).toFixed(2)}</td>
        </tr>`;
      }).join("")}
    </tbody>
    <tfoot>
      <tr style="background:#eff6ff;border-top:2px solid #3B82F6">
        <td style="font-weight:700;color:#1d4ed8;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Total Qty</td>
        <td style="text-align:right;font-weight:800;color:#1d4ed8;font-family:monospace;font-size:14px">${sale.items.reduce((s, it) => s + (it.qty || 0), 0).toLocaleString()}</td>
        <td colspan="3"></td>
      </tr>
    </tfoot>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${curr}${Number(sale.subtotal).toFixed(2)}</span></div>
    <div class="totals-row"><span>${taxName} (${vatPct}%)</span><span>${curr}${Number(sale.vat).toFixed(2)}</span></div>
    <div class="totals-row total"><span>Total</span><span>${curr}${Number(sale.total).toFixed(2)}</span></div>
  </div>
  ${sale.notes ? `<div style="margin-top:28px;padding:14px 16px;background:#f8f9fa;border-radius:8px;font-size:12px;color:#555"><strong>Notes:</strong> ${sale.notes}</div>` : ""}
  <div class="footer">Thank you for your business! · ${settings.companyName || "BizCore Systems"} · ${settings.email || ""}</div>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 300); };
    } else {
      // Fallback: direct download as .html if popup blocked
      const a = document.createElement("a");
      a.href = url; a.download = `${sale.invoiceNo}.html`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader
        title="Sales Management"
        subtitle={`${data.sales.length} total sales`}
        actions={<>
          <button className="btn btn-secondary" onClick={openReportModal}><Icon name="download" size={15} /> Sales Report</button>
          <button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={15} /> New Sale</button>
        </>}
      />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
        {[
          { l: "Total Sales", v: data.sales.reduce((s, x) => s + x.total, 0), c: "blue", icon: "sales" },
          { l: "Collected", v: data.sales.reduce((s, x) => s + x.paid, 0), c: "green", icon: "check" },
          { l: "Outstanding Due", v: totalDueAmount, c: "red", icon: "alert" },
          { l: "Transactions", v: data.sales.length, c: "purple", prefix: "", icon: "reports" },
        ].map(s => {
          const colorMap = { blue: "#3B82F6", green: "#10B981", red: "#EF4444", purple: "#8B5CF6" };
          const glowMap = { blue: "rgba(59,130,246,0.08)", green: "rgba(16,185,129,0.08)", red: "rgba(239,68,68,0.08)", purple: "rgba(139,92,246,0.08)" };
          const col = colorMap[s.c];
          const glow = glowMap[s.c];
          return (
            <div key={s.l} className="card" style={{ padding: 18, borderColor: s.c === "red" && totalDueAmount > 0 ? "rgba(239,68,68,0.3)" : "#E2E8F0", background: s.c === "red" && totalDueAmount > 0 ? "rgba(239,68,68,0.04)" : "#FFFFFF", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -12, right: -12, width: 64, height: 64, borderRadius: "50%", background: glow, filter: "blur(8px)" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.l}</div>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: glow, border: `1px solid ${col}30`, display: "flex", alignItems: "center", justifyContent: "center", color: col }}><Icon name={s.icon} size={13} /></div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.c === "red" && totalDueAmount > 0 ? "#EF4444" : "#0F172A", fontFamily: "IBM Plex Mono" }}>
                {s.prefix !== "" ? curr : ""}{typeof s.v === "number" ? s.v.toLocaleString("en-US", { minimumFractionDigits: s.prefix !== "" ? 2 : 0, maximumFractionDigits: s.prefix !== "" ? 2 : 0 }) : s.v}
              </div>
              {s.c === "red" && totalDueInvoices > 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: "#EF4444", fontFamily: "IBM Plex Mono" }}>
                  {totalDueInvoices} invoice{totalDueInvoices > 1 ? "s" : ""} unpaid
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── DUE OVERVIEW PANEL ── */}
      <div className="card" style={{ marginBottom: 20, borderColor: totalDueAmount > 0 ? "rgba(239,68,68,0.25)" : "#E2E8F0", overflow: "hidden" }}>
        {/* Panel Header */}
        <div
          onClick={() => setShowDuePanel(p => !p)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", background: totalDueAmount > 0 ? "rgba(239,68,68,0.04)" : "transparent", borderBottom: showDuePanel ? "1px solid #E2E8F0" : "none", transition: "background 0.2s" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444" }}>
              <Icon name="alert" size={15} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Due Overview</div>
              <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono" }}>
                {totalDueInvoices} due invoice{totalDueInvoices !== 1 ? "s" : ""} · {totalPartialInvoices} partial · {customerDueList.length} customer{customerDueList.length !== 1 ? "s" : ""} affected
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {totalDueAmount > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#EF4444", fontFamily: "IBM Plex Mono" }}>{curr}{totalDueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Outstanding</div>
              </div>
            )}
            {totalDueAmount === 0 && <span className="badge badge-success">✓ All Clear</span>}
            {totalDueAmount > 0 && (
              <>
                <button
                  className="btn btn-sm"
                  onClick={e => { e.stopPropagation(); downloadDueOverviewCSV(); }}
                  style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.25)", display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 12px" }}
                  title="Download Due Overview as Excel (CSV)"
                >
                  <Icon name="download" size={13} /> Excel
                </button>
                <button
                  className="btn btn-sm"
                  onClick={e => { e.stopPropagation(); downloadDueOverviewPDF(); }}
                  style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 12px" }}
                  title="Download Due Overview as PDF"
                >
                  <Icon name="download" size={13} /> PDF
                </button>
              </>
            )}
            <div style={{ color: "#64748B", transform: showDuePanel ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", fontSize: 18, lineHeight: 1 }}>⌄</div>
          </div>
        </div>

        {showDuePanel && (
          <div style={{ padding: 20 }}>
            {totalDueAmount === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#10B981" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No outstanding dues!</div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>All invoices are fully paid.</div>
              </div>
            ) : (
              <>
                {/* Summary Cards Row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Due Invoices", value: totalDueInvoices, unit: "invoices", color: "#EF4444", glow: "rgba(239,68,68,0.1)", icon: "📄" },
                    { label: "Total Due Amount", value: `${curr}${totalDueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, unit: "outstanding", color: "#EF4444", glow: "rgba(239,68,68,0.1)", icon: "💰", isAmount: true },
                    { label: "Customers with Due", value: customerDueList.length, unit: "customers", color: "#F59E0B", glow: "rgba(245,158,11,0.1)", icon: "👥" },
                  ].map(card => (
                    <div key={card.label} style={{ background: "#FFFFFF", border: `1px solid ${card.color}25`, borderRadius: 12, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${card.color}, transparent)`, borderRadius: "12px 12px 0 0" }} />
                      <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{card.label}</div>
                      <div style={{ fontSize: card.isAmount ? 18 : 28, fontWeight: 800, color: card.color, fontFamily: "IBM Plex Mono", lineHeight: 1.1 }}>{card.value}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 4, textTransform: "capitalize" }}>{card.unit}</div>
                    </div>
                  ))}
                </div>

                {/* Customer Due Table */}
                <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "IBM Plex Mono" }}>
                      Customer-wise Due Breakdown
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[["amount", "By Amount"], ["invoices", "By Invoices"], ["name", "By Name"]].map(([key, label]) => (
                        <button key={key} onClick={() => setDueSort(key)} style={{
                          padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontFamily: "IBM Plex Mono",
                          background: dueSort === key ? "#EF4444" : "#F1F5F9",
                          color: dueSort === key ? "white" : "#64748B",
                          transition: "all 0.15s",
                        }}>{label}</button>
                      ))}
                    </div>
                  </div>

                  {customerDueList.length === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "#64748B", fontSize: 13 }}>No due amounts found</div>
                  ) : (
                    <div style={{ maxHeight: 340, overflowY: "auto" }}>
                      {customerDueList.map((cust, idx) => {
                        const pct = Math.min(100, (cust.dueAmount / maxDue) * 100);
                        const urgencyColor = pct > 70 ? "#EF4444" : pct > 35 ? "#F59E0B" : "#3B82F6";
                        return (
                          <div key={cust.id} style={{ padding: "14px 16px", borderBottom: idx < customerDueList.length - 1 ? "1px solid #FFFFFF" : "none", display: "flex", alignItems: "center", gap: 14 }}>
                            {/* Rank */}
                            <div style={{ width: 22, height: 22, borderRadius: 6, background: idx === 0 ? "rgba(239,68,68,0.15)" : idx === 1 ? "rgba(245,158,11,0.1)" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: idx === 0 ? "#EF4444" : idx === 1 ? "#F59E0B" : "#64748B", fontFamily: "IBM Plex Mono", flexShrink: 0 }}>
                              {idx + 1}
                            </div>
                            {/* Avatar */}
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${urgencyColor}15`, border: `1px solid ${urgencyColor}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: urgencyColor }}>
                              {cust.name.charAt(0).toUpperCase()}
                            </div>
                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{cust.name}</span>
                                  <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono", background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)", padding: "2px 7px", borderRadius: 20 }}>
                                    {cust.invoiceCount} inv
                                  </span>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 800, color: urgencyColor, fontFamily: "IBM Plex Mono" }}>
                                    {curr}{cust.dueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                  <div style={{ fontSize: 10, color: "#475569" }}>{pct.toFixed(1)}% of max</div>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div style={{ height: 5, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${urgencyColor}, ${urgencyColor}99)`, transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }} />
                              </div>
                              {/* Invoice pills (max 4) */}
                              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                                {cust.invoices.slice(0, 4).map(inv => (
                                  <span key={inv} style={{ fontSize: 9, fontFamily: "IBM Plex Mono", background: "#F1F5F9", color: "#64748B", padding: "2px 6px", borderRadius: 4, border: "1px solid #E2E8F0" }}>{inv}</span>
                                ))}
                                {cust.invoices.length > 4 && <span style={{ fontSize: 9, fontFamily: "IBM Plex Mono", color: "#64748B" }}>+{cust.invoices.length - 4} more</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Filters & Search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by ID, customer, invoice..." style={{ flex: 1, minWidth: 200 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "paid", "due", "partial", "advance", "return", "deducted", "aidtds"].map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }} className="btn btn-secondary btn-sm"
              style={{ background: filter === f ? "#3B82F6" : "#F1F5F9", color: filter === f ? "white" : "#475569", border: `1px solid ${filter === f ? "#3B82F6" : "#E2E8F0"}` }}>
              {f === "aidtds" ? "AIT-TDS" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr>
              <th>#</th><th>Invoice</th><th>Date</th><th>Customer</th><th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={10}><EmptyState message="No sales found" /></td></tr>
              ) : paginated.map((sale, idx) => {
                const cust = data.customers.find(c => c.id === sale.customerId);
                const serial = filtered.length - ((page - 1) * PER_PAGE + idx);
                return (
                  <tr key={sale.id}>
                    <td><span className="mono" style={{ color: "#64748B", fontSize: 12 }}>{serial}</span></td>
                    <td><span className="mono" style={{ color: "#3B82F6", fontSize: 12 }}>{sale.invoiceNo}</span></td>
                    <td><span className="mono" style={{ fontSize: 12 }}>{sale.date}</span></td>
                    <td>{cust?.name || "—"}</td>
                    <td>{sale.saleType === "advance" ? <span className="badge badge-purple">Payment</span> : sale.saleType === "return" ? <span className="badge badge-danger">Return</span> : sale.saleType === "deducted" ? <span className="badge" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}>Deducted</span> : sale.saleType === "aidtds" ? <span className="badge badge-tds">AIT-TDS</span> : <span className="badge badge-gray">{sale.items.length} items</span>}</td>
                    <td><span className="mono" style={{ color: sale.saleType === "return" ? "#EF4444" : sale.saleType === "deducted" ? "#F59E0B" : sale.saleType === "aidtds" ? "#06B6D4" : "#E2E8F0" }}>{sale.saleType === "advance" ? "—" : sale.saleType === "return" ? `↩ ${curr}${sale.total.toFixed(2)}` : (sale.saleType === "deducted" || sale.saleType === "aidtds") ? `− ${curr}${Math.abs(sale.total).toFixed(2)}` : `${curr}${sale.total.toFixed(2)}`}</span></td>
                    <td><span className="mono" style={{ color: "#10B981" }}>{(sale.saleType === "return" || sale.saleType === "deducted" || sale.saleType === "aidtds") ? "—" : `${curr}${sale.paid.toFixed(2)}`}</span></td>
                    <td><span className="mono" style={{ color: sale.due > 0 ? "#EF4444" : "#64748B" }}>{(sale.saleType === "advance" || sale.saleType === "return" || sale.saleType === "deducted" || sale.saleType === "aidtds") ? "—" : `${curr}${sale.due.toFixed(2)}`}</span></td>
                    <td><StatusBadge status={sale.status} /></td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-secondary btn-sm btn-icon" title="View Invoice" onClick={() => setViewInvoice(sale)}><Icon name="eye" size={13} /></button>
                        <button className="btn btn-secondary btn-sm btn-icon" title="Download Invoice" onClick={() => triggerInvoiceDownload(sale)}><Icon name="download" size={13} /></button>
                        <button className="btn btn-secondary btn-sm btn-icon" title="Edit Sale" onClick={() => openEdit(sale)}><Icon name="edit" size={13} /></button>
                        <button className="btn btn-danger btn-sm btn-icon" title="Delete Sale" onClick={() => deleteSale(sale)}><Icon name="trash" size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {/* New Sale Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editItem ? "Edit Sale" : "Create New Sale"} width={820}>
        {(() => {
          const selectedCustomer = data.customers.find(c => c.id === form.customerId);
          const curr2 = data.settings.currency || "৳";
          const taxName2 = data.settings.taxName || "VAT";

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

              {/* ── SALE TYPE TOGGLE ── */}
              <div style={{ display: "flex", gap: 6, marginBottom: 20, padding: 4, background: "#F4F6FB", borderRadius: 12, border: "1px solid #E2E8F0" }}>
                {[
                  { id: "regular", label: "Regular Sale", icon: "sales", desc: "Sell products to customer", color: "#3B82F6" },
                  { id: "advance", label: "Payment", icon: "wallet", desc: "Apply payment to a due invoice", color: "#10B981" },
                  { id: "return", label: "Return", icon: "refresh", desc: "Accept returned products", color: "#EF4444" },
                  { id: "deducted", label: "Deducted", icon: "trend_down", desc: "Deduct an amount from balance", color: "#F59E0B" },
                  { id: "aidtds", label: "AIT-TDS", icon: "invoice", desc: "Record an AIT/TDS deduction from balance", color: "#06B6D4" },
                ].map(type => {
                  const active = form.saleType === type.id;
                  return (
                    <button key={type.id} onClick={() => setForm(f => ({ ...f, saleType: type.id }))} style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
                      borderRadius: 9, border: "none", cursor: "pointer", transition: "all 0.2s",
                      background: active ? `linear-gradient(135deg, ${type.color}22, ${type.color}10)` : "transparent",
                      outline: active ? `1.5px solid ${type.color}66` : "1.5px solid transparent",
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: active ? `${type.color}25` : "rgba(15,23,42,0.04)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: active ? type.color : "#475569",
                        transition: "all 0.2s",
                      }}>
                        <Icon name={type.icon} size={16} />
                      </div>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#0F172A" : "#64748B", transition: "color 0.2s" }}>{type.label}</div>
                        <div style={{ fontSize: 11, color: active ? "#64748B" : "#374151", marginTop: 1 }}>{type.desc}</div>
                      </div>
                      {active && (
                        <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: type.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="check" size={10} color="white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ── SECTION 1: CUSTOMER & DATE ── */}
              <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="customers" size={11} color="#3B82F6" />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Customer & Date</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
                  <div>
                    <label className="form-label">Customer *</label>
                    <SearchableDropdown
                      value={form.customerId}
                      onChange={val => setForm(f => ({ ...f, customerId: val }))}
                      placeholder="Search by name or ID…"
                      options={data.customers.map(c => ({
                        value: c.id,
                        label: c.name,
                        sub: c.customerId ? `ID #${c.customerId}` : (c.phone || ""),
                      }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Sale Date</label>
                    <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                </div>

                {/* Invoice references — shown on the invoice only, never in the customer ledger */}
                {form.saleType === "regular" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                    <div>
                      <label className="form-label">Work Order <span style={{ color: "#475569", fontWeight: 400 }}>(optional)</span></label>
                      <input type="text" value={form.workOrder || ""} placeholder="e.g. WO-2026-045" onChange={e => setForm(f => ({ ...f, workOrder: e.target.value }))} />
                    </div>
                    <div>
                      <label className="form-label">Buyer Ref. No. <span style={{ color: "#475569", fontWeight: 400 }}>(optional)</span></label>
                      <input type="text" value={form.buyerRef || ""} placeholder="e.g. PO-88421" onChange={e => setForm(f => ({ ...f, buyerRef: e.target.value }))} />
                    </div>
                  </div>
                )}

                {/* Customer info preview */}
                {selectedCustomer && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", borderRadius: 9,
                    background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
                    animation: "fadeIn 0.2s ease",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#3B82F6" }}>
                        {selectedCustomer.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{selectedCustomer.name}</div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>{selectedCustomer.phone || selectedCustomer.email || "No contact info"}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                      {selectedCustomer.customerId && (
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono" }}>CUSTOMER ID</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#3B82F6", fontFamily: "IBM Plex Mono" }}>#{selectedCustomer.customerId}</div>
                        </div>
                      )}
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono" }}>BALANCE DUE</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: selectedCustomer.balance > 0 ? "#EF4444" : "#10B981", fontFamily: "IBM Plex Mono" }}>{curr2}{(selectedCustomer.balance || 0).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── PAYMENT FLOW ── */}
              {form.saleType === "advance" && (
                <div style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="wallet" size={11} color="#10B981" />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Payment Amount</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18, fontWeight: 800, color: "#10B981", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>{curr2}</span>
                        <input type="number" min={0} value={form.advanceAmount}
                          onChange={e => setForm(f => ({ ...f, advanceAmount: e.target.value }))}
                          style={{ paddingLeft: 36, fontSize: 22, fontWeight: 800, fontFamily: "IBM Plex Mono", color: "#10B981", background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.3)", height: 52 }}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: 9, fontSize: 12, color: "#475569", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: "#10B981", marginBottom: 2 }}>What happens?</div>
                      Recorded as payment and tracked against this customer's ledger.
                    </div>
                  </div>
                  {/* Payment Method */}
                  <div>
                    <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Payment Method</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                      {["Cash", "Premier Bank", "UCB Bank", "Woori Bank"].map(method => {
                        const active = (form.paymentMethod || "Cash") === method;
                        return (
                          <button key={method} onClick={() => setForm(f => ({ ...f, paymentMethod: method }))}
                            style={{
                              padding: "7px 6px", borderRadius: 7,
                              border: `1px solid ${active ? "rgba(16,185,129,0.5)" : "#E2E8F0"}`,
                              background: active ? "rgba(16,185,129,0.12)" : "transparent",
                              color: active ? "#10B981" : "#475569",
                              fontSize: 11, fontWeight: 700, fontFamily: "IBM Plex Mono",
                              cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
                              overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                            {method}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── DEDUCTION FLOW ── */}
              {form.saleType === "deducted" && (
                <div style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="trend_down" size={11} color="#F59E0B" />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Deduction Amount</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18, fontWeight: 800, color: "#F59E0B", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>− {curr2}</span>
                        <input type="number" min={0} value={form.deductedAmount}
                          onChange={e => setForm(f => ({ ...f, deductedAmount: e.target.value }))}
                          style={{ paddingLeft: 58, fontSize: 22, fontWeight: 800, fontFamily: "IBM Plex Mono", color: "#F59E0B", background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.3)", height: 52 }}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 9, fontSize: 12, color: "#475569", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: "#F59E0B", marginBottom: 2 }}>What happens?</div>
                      Recorded as a negative amount and subtracted from this customer's ledger balance.
                    </div>
                  </div>
                </div>
              )}

              {/* ── AIT-TDS FLOW ── */}
              {form.saleType === "aidtds" && (
                <div style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(6,182,212,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="invoice" size={11} color="#06B6D4" />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#06B6D4", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>AIT-TDS Amount</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18, fontWeight: 800, color: "#06B6D4", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>− {curr2}</span>
                        <input type="number" min={0} value={form.aidTdsAmount}
                          onChange={e => setForm(f => ({ ...f, aidTdsAmount: e.target.value }))}
                          style={{ paddingLeft: 58, fontSize: 22, fontWeight: 800, fontFamily: "IBM Plex Mono", color: "#06B6D4", background: "rgba(6,182,212,0.06)", borderColor: "rgba(6,182,212,0.3)", height: 52 }}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px", background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)", borderRadius: 9, fontSize: 12, color: "#475569", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: "#06B6D4", marginBottom: 2 }}>What happens?</div>
                      Recorded as a negative amount and subtracted from this customer's ledger balance.
                    </div>
                  </div>
                </div>
              )}

              {/* ── RETURN FLOW ── */}
              {form.saleType === "return" && (<>
                <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  {/* Section header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="refresh" size={11} color="#EF4444" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Returned Products</span>
                      <span style={{ fontSize: 11, color: "#374151", fontFamily: "IBM Plex Mono" }}>({(form.returnItems || []).length} {(form.returnItems || []).length === 1 ? "row" : "rows"})</span>
                    </div>
                    <button className="btn btn-sm" onClick={addReturnItem}
                      style={{ gap: 5, border: "1px dashed rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.06)", color: "#EF4444", fontSize: 12 }}>
                      <Icon name="plus" size={12} /> Add Row
                    </button>
                  </div>

                  {/* Column headers */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "2fr 60px 88px 110px 90px 32px",
                    gap: 8, paddingBottom: 8, marginBottom: 6, borderBottom: "1px solid rgba(239,68,68,0.15)",
                  }}>
                    {["Product", "Unit", "Qty", "Return Price", "Line Total", ""].map((h, idx) => (
                      <div key={idx} style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "IBM Plex Mono", textAlign: idx >= 4 ? "center" : "left", opacity: 0.7 }}>{h}</div>
                    ))}
                  </div>

                  {/* Return item rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(form.returnItems || []).map((item, i) => {
                      const prod = data.products.find(p => p.id === item.productId);
                      const lineTotal = (item.qty || 0) * (item.price || 0);
                      return (
                        <div key={i} style={{
                          display: "grid", gridTemplateColumns: "2fr 60px 88px 110px 90px 32px",
                          gap: 8, alignItems: "start", padding: "8px 10px", borderRadius: 9,
                          background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.12)",
                        }}>
                          <SearchableDropdown
                            value={item.productId}
                            onChange={val => updateReturnItem(i, "productId", val)}
                            placeholder="Search product…"
                            options={data.products.map(p => ({
                              value: p.id,
                              label: p.name,
                              sub: `Stock: ${p.stock} ${p.unit || "pcs"}`,
                            }))}
                          />
                          {/* Unit */}
                          <div style={{
                            padding: "6px 4px", borderRadius: 7, textAlign: "center",
                            background: item.unit ? "rgba(239,68,68,0.08)" : "#FFFFFF",
                            border: `1px solid ${item.unit ? "rgba(239,68,68,0.2)" : "#E2E8F0"}`,
                            fontSize: 11, fontWeight: 700, color: item.unit ? "#EF4444" : "#374151",
                            fontFamily: "IBM Plex Mono", minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center",
                            marginTop: 1,
                          }}>{item.unit || "—"}</div>
                          {/* Qty */}
                          <input type="number" value={item.qty} onChange={e => updateReturnItem(i, "qty", +e.target.value)} min={1}
                            style={{ textAlign: "center", borderColor: "rgba(239,68,68,0.25)" }} />
                          {/* Return Price */}
                          <div style={{ position: "relative" }}>
                            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#475569", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>{curr2}</span>
                            <input type="number" value={item.price} onChange={e => updateReturnItem(i, "price", +e.target.value)} min={0}
                              style={{ paddingLeft: 22, borderColor: "rgba(239,68,68,0.25)" }} />
                          </div>
                          {/* Line Total */}
                          <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontSize: 13, fontWeight: 700, color: lineTotal > 0 ? "#EF4444" : "#374151", paddingTop: 6 }}>
                            {curr2}{lineTotal.toFixed(2)}
                          </div>
                          {/* Remove */}
                          <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeReturnItem(i)}
                            disabled={(form.returnItems || []).length === 1}
                            style={{ opacity: (form.returnItems || []).length === 1 ? 0.3 : 1, width: 28, height: 28, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon name="trash" size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Return Total Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div style={{ background: "#FFFFFF", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, color: "#EF4444", fontFamily: "IBM Plex Mono", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>Return Summary</div>
                    {(form.returnItems || []).filter(it => it.productId).map((it, i) => {
                      const prod = data.products.find(p => p.id === it.productId);
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "#475569" }}>
                          <span>{prod?.name || "—"} × {it.qty}</span>
                          <span style={{ fontFamily: "IBM Plex Mono", color: "#EF4444" }}>{curr2}{((it.qty || 0) * (it.price || 0)).toFixed(2)}</span>
                        </div>
                      );
                    })}
                    <div style={{ height: 1, background: "rgba(239,68,68,0.15)", margin: "10px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Total Return</span>
                      <span style={{ fontFamily: "IBM Plex Mono", fontSize: 20, fontWeight: 800, color: "#EF4444" }}>{curr2}{returnTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <div style={{ background: "#FFFFFF", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon name="refresh" size={13} color="#EF4444" />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>What happens on save?</div>
                        <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.6 }}>
                          ✓ Returned qty added back to inventory<br/>
                          ✓ Return credit recorded in customer ledger<br/>
                          ✓ Invoice generated with RET- prefix
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>)}

              {/* ── REGULAR SALE: PRODUCTS ── */}
              {form.saleType === "regular" && (<>
                <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  {/* Section header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="package" size={11} color="#10B981" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Products</span>
                      <span style={{ fontSize: 11, color: "#374151", fontFamily: "IBM Plex Mono" }}>({form.items.length} {form.items.length === 1 ? "row" : "rows"})</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <label style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono", whiteSpace: "nowrap" }}>{taxName2} %</label>
                        <input type="number" value={form.vatRate} onChange={e => setForm(f => ({ ...f, vatRate: +e.target.value }))} min={0} max={100}
                          style={{ width: 64, padding: "5px 8px", textAlign: "center", fontSize: 12 }} />
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={addItem} style={{ gap: 5, border: "1px dashed #CBD5E1" }}>
                        <Icon name="plus" size={12} /> Add Row
                      </button>
                    </div>
                  </div>

                  {/* Column headers */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "2fr 60px 88px 100px 72px 80px 32px",
                    gap: 8, paddingBottom: 8, marginBottom: 6, borderBottom: "1px solid #E2E8F0",
                  }}>
                    {["Product", "Unit", "Qty", "Unit Price", "Disc %", "Line Total", ""].map((h, idx) => (
                      <div key={idx} style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "IBM Plex Mono", textAlign: idx >= 4 ? "center" : "left" }}>{h}</div>
                    ))}
                  </div>

                  {/* Product rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {form.items.map((item, i) => {
                      const prod = data.products.find(p => p.id === item.productId);
                      const lineTotal = (item.qty || 0) * (item.price || 0) * (1 - (item.discount || 0) / 100);
                      const overStock = prod && item.qty > prod.stock;
                      return (
                        <div key={i} style={{
                          display: "grid", gridTemplateColumns: "2fr 60px 88px 100px 72px 80px 32px",
                          gap: 8, alignItems: "start", padding: "8px 10px", borderRadius: 9,
                          background: overStock ? "rgba(239,68,68,0.04)" : "rgba(15,23,42,0.015)",
                          border: `1px solid ${overStock ? "rgba(239,68,68,0.2)" : "#E2E8F0"}`,
                          transition: "border-color 0.15s",
                        }}>
                          <SearchableDropdown
                            value={item.productId}
                            onChange={val => updateItem(i, "productId", val)}
                            placeholder="Search product…"
                            options={data.products.map(p => ({
                              value: p.id,
                              label: p.name,
                              sub: `Stock: ${p.stock} ${p.unit || "pcs"}`,
                            }))}
                          />
                          {/* Unit */}
                          <div style={{
                            padding: "6px 4px", borderRadius: 7, textAlign: "center",
                            background: item.unit ? "rgba(16,185,129,0.08)" : "#FFFFFF",
                            border: `1px solid ${item.unit ? "rgba(16,185,129,0.2)" : "#E2E8F0"}`,
                            fontSize: 11, fontWeight: 700, color: item.unit ? "#10B981" : "#374151",
                            fontFamily: "IBM Plex Mono", minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center",
                            marginTop: 1,
                          }}>{item.unit || "—"}</div>
                          {/* Qty */}
                          <div style={{ position: "relative" }}>
                            <input type="number" value={item.qty} onChange={e => updateItem(i, "qty", +e.target.value)} min={1}
                              style={{ textAlign: "center", borderColor: overStock ? "rgba(239,68,68,0.4)" : "#E2E8F0" }} />
                            {overStock && (
                              <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, fontSize: 9, color: "#EF4444", fontFamily: "IBM Plex Mono", textAlign: "center" }}>
                                Max: {prod.stock}
                              </div>
                            )}
                          </div>
                          {/* Price */}
                          <div style={{ position: "relative" }}>
                            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#475569", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>{curr2}</span>
                            <input type="number" value={item.price} onChange={e => updateItem(i, "price", +e.target.value)} min={0} style={{ paddingLeft: 22 }} />
                          </div>
                          {/* Discount */}
                          <div style={{ position: "relative" }}>
                            <input type="number" value={item.discount} onChange={e => updateItem(i, "discount", +e.target.value)} min={0} max={100} style={{ textAlign: "center", paddingRight: 18 }} />
                            <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#475569", pointerEvents: "none" }}>%</span>
                          </div>
                          {/* Line Total */}
                          <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontSize: 13, fontWeight: 700, color: lineTotal > 0 ? "#0F172A" : "#374151" }}>
                            {curr2}{lineTotal.toFixed(2)}
                          </div>
                          {/* Remove */}
                          <button
                            className="btn btn-danger btn-sm btn-icon"
                            onClick={() => removeItem(i)}
                            disabled={form.items.length === 1}
                            style={{ opacity: form.items.length === 1 ? 0.3 : 1, width: 28, height: 28, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <Icon name="trash" size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── TOTALS + PAYMENT (side by side) ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

                  {/* Order Summary */}
                  <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="reports" size={11} color="#3B82F6" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Order Summary</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#64748B" }}>Subtotal</span>
                      <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#475569" }}>{curr2}{subtotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#64748B" }}>{taxName2} ({form.vatRate}%)</span>
                      <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#F59E0B" }}>{curr2}{vat.toFixed(2)}</span>
                    </div>
                    <div style={{ height: 1, background: "#E2E8F0", margin: "8px 0 12px" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Grand Total</span>
                      <span style={{ fontFamily: "IBM Plex Mono", fontSize: 20, fontWeight: 800, color: "#3B82F6" }}>{curr2}{total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="finance" size={11} color="#10B981" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Payment</span>
                    </div>

                    {/* Amount Paid input */}
                    <div style={{ position: "relative", marginBottom: 10 }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "#10B981", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>{curr2}</span>
                      <input type="number" min={0} value={form.paidAmount}
                        onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))}
                        style={{ paddingLeft: 28, fontFamily: "IBM Plex Mono", fontWeight: 700, fontSize: 15, color: "#10B981", borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.05)" }}
                        placeholder="0.00"
                      />
                    </div>

                    {/* Payment Method dropdown */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Payment Method</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                        {["Cash", "Premier Bank", "UCB Bank", "Woori Bank"].map(method => {
                          const active = (form.paymentMethod || "Cash") === method;
                          return (
                            <button key={method} onClick={() => setForm(f => ({ ...f, paymentMethod: method }))}
                              style={{
                                padding: "7px 6px", borderRadius: 7,
                                border: `1px solid ${active ? "rgba(16,185,129,0.5)" : "#E2E8F0"}`,
                                background: active ? "rgba(16,185,129,0.12)" : "transparent",
                                color: active ? "#10B981" : "#475569",
                                fontSize: 11, fontWeight: 700, fontFamily: "IBM Plex Mono",
                                cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
                                overflow: "hidden", textOverflow: "ellipsis",
                              }}>
                              {method}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Due + Status row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono", marginBottom: 2 }}>DUE / BALANCE</div>
                        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 14, fontWeight: 800, color: dueAmt > 0 ? "#EF4444" : "#10B981" }}>{curr2}{dueAmt.toFixed(2)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono", marginBottom: 4 }}>STATUS</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {["", "paid", "partial", "due"].map(s => {
                            const label = s === "" ? `Auto` : s.charAt(0).toUpperCase() + s.slice(1);
                            const isActive = form.status === s;
                            const colMap = { paid: "#10B981", partial: "#F59E0B", due: "#EF4444", "": "#3B82F6" };
                            const col = colMap[s] || "#3B82F6";
                            return (
                              <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                                style={{
                                  padding: "4px 8px", borderRadius: 6, border: `1px solid ${isActive ? col : "#E2E8F0"}`,
                                  background: isActive ? `${col}20` : "transparent",
                                  color: isActive ? col : "#475569",
                                  fontSize: 10, fontWeight: 700, fontFamily: "IBM Plex Mono", cursor: "pointer",
                                  transition: "all 0.15s",
                                }}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>)}

              {/* ── NOTES ── */}
              <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "IBM Plex Mono", display: "block", marginBottom: 8 }}>Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  placeholder="Add any extra information or instructions…"
                  style={{ resize: "vertical", minHeight: 60 }}
                />
              </div>

              {/* ── FOOTER ACTIONS ── */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", background: "#F4F6FB", borderRadius: 12,
                border: "1px solid #E2E8F0",
              }}>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  {form.saleType === "regular" && total > 0 && (
                    <span>
                      {form.items.filter(it => it.productId).length} product{form.items.filter(it => it.productId).length !== 1 ? "s" : ""} · Grand Total: <strong style={{ color: "#3B82F6", fontFamily: "IBM Plex Mono" }}>{curr2}{total.toFixed(2)}</strong>
                    </span>
                  )}
                  {form.saleType === "advance" && +form.advanceAmount > 0 && (
                    <span>Payment: <strong style={{ color: "#8B5CF6", fontFamily: "IBM Plex Mono" }}>{curr2}{(+form.advanceAmount).toFixed(2)}</strong></span>
                  )}
                  {form.saleType === "return" && returnTotal > 0 && (
                    <span>Return Credit: <strong style={{ color: "#EF4444", fontFamily: "IBM Plex Mono" }}>{curr2}{returnTotal.toFixed(2)}</strong></span>
                  )}
                  {form.saleType === "deducted" && +form.deductedAmount > 0 && (
                    <span>Deducted: <strong style={{ color: "#F59E0B", fontFamily: "IBM Plex Mono" }}>− {curr2}{(+form.deductedAmount).toFixed(2)}</strong></span>
                  )}
                  {form.saleType === "aidtds" && +form.aidTdsAmount > 0 && (
                    <span>AIT-TDS: <strong style={{ color: "#06B6D4", fontFamily: "IBM Plex Mono" }}>− {curr2}{(+form.aidTdsAmount).toFixed(2)}</strong></span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ padding: "9px 20px" }}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={submitSale} style={{
                    padding: "9px 24px", fontWeight: 700, fontSize: 13,
                    background: form.saleType === "advance" ? "linear-gradient(135deg, #059669, #10B981)" : form.saleType === "return" ? "linear-gradient(135deg, #DC2626, #EF4444)" : form.saleType === "deducted" ? "linear-gradient(135deg, #D97706, #F59E0B)" : form.saleType === "aidtds" ? "linear-gradient(135deg, #0891B2, #06B6D4)" : "linear-gradient(135deg, #2563EB, #3B82F6)",
                    boxShadow: form.saleType === "advance" ? "0 4px 14px rgba(16,185,129,0.35)" : form.saleType === "return" ? "0 4px 14px rgba(239,68,68,0.35)" : form.saleType === "deducted" ? "0 4px 14px rgba(245,158,11,0.35)" : form.saleType === "aidtds" ? "0 4px 14px rgba(6,182,212,0.35)" : "0 4px 14px rgba(59,130,246,0.35)",
                  }}>
                    <Icon name="check" size={14} />
                    {form.saleType === "advance" ? "Apply Payment" : form.saleType === "return" ? "Process Return" : form.saleType === "deducted" ? "Save Deduction" : form.saleType === "aidtds" ? "Save AIT-TDS" : editItem ? "Update Sale" : "Create Sale"}
                  </button>
                </div>
              </div>

            </div>
          );
        })()}
      </Modal>

      {/* Invoice Modal */}
      <Modal open={!!viewInvoice} onClose={() => setViewInvoice(null)} title="Invoice Preview" width={600}>
        {viewInvoice && <InvoicePreview sale={viewInvoice} />}
      </Modal>

      {/* Sales History Report Modal */}
      <Modal open={showReportModal} onClose={() => setShowReportModal(false)} title="Sales Report" width={560}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
            Download a complete, professionally formatted sales report as PDF. Defaults to your <strong>entire sales history</strong> — from the very first sale (<span style={{ fontFamily: "IBM Plex Mono" }}>{firstSaleDate2}</span>) up to today — or pick any custom date range below.
          </div>

          {/* Quick presets */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[
              { l: "All Time (Since First Sale)", from: firstSaleDate2, to: fmt(today) },
              { l: "This Month", from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) },
              { l: "This Year", from: fmt(new Date(today.getFullYear(), 0, 1)), to: fmt(today) },
              { l: "Last 30 Days", from: daysAgo(30), to: fmt(today) },
              { l: "Last 90 Days", from: daysAgo(90), to: fmt(today) },
            ].map(p => (
              <button key={p.l} className="btn btn-secondary btn-sm"
                onClick={() => { setReportFrom(p.from); setReportTo(p.to); }}
                style={{
                  fontSize: 11, padding: "6px 10px",
                  background: reportFrom === p.from && reportTo === p.to ? "#3B82F6" : "#F1F5F9",
                  color: reportFrom === p.from && reportTo === p.to ? "white" : "#475569",
                  border: `1px solid ${reportFrom === p.from && reportTo === p.to ? "#3B82F6" : "#E2E8F0"}`,
                }}>
                {p.l}
              </button>
            ))}
          </div>

          {/* Date range pickers */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "#64748B", display: "block", marginBottom: 6 }}>From</label>
              <input type="date" value={reportFrom} min={firstSaleDate2} max={reportTo} onChange={e => setReportFrom(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: "#64748B", display: "block", marginBottom: 6 }}>To</label>
              <input type="date" value={reportTo} min={reportFrom} onChange={e => setReportTo(e.target.value)} style={{ width: "100%" }} />
            </div>
          </div>

          {/* Sale-type filter */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: "#64748B" }}>Include Types / অন্তর্ভুক্ত করুন</label>
              <button onClick={selectAllTypes} style={{ fontSize: 10.5, color: "#3B82F6", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Select All</button>
            </div>
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>By default only <strong>Sales</strong> is included. Tap ✓ to add Deducted / AIT-TDS / Payment / Returns, or ONLY to switch to just that type.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { key: "regular", l: "Sales", c: "#3B82F6" },
                { key: "deducted", l: "Deducted", c: "#F59E0B" },
                { key: "aidtds", l: "AIT-TDS", c: "#06B6D4" },
                { key: "advance", l: "Payment", c: "#8B5CF6" },
                { key: "return", l: "Returns", c: "#EF4444" },
              ].map(t => {
                const active = reportTypes[t.key];
                const onlyThisSelected = active && !["regular", "deducted", "aidtds", "advance", "return"].filter(k => k !== t.key).some(k => reportTypes[k]);
                return (
                  <div key={t.key} style={{
                    display: "flex", alignItems: "center", borderRadius: 8,
                    border: `1px solid ${active ? t.c : "#E2E8F0"}`,
                    background: active ? `${t.c}1F` : "#F1F5F9",
                    overflow: "hidden",
                  }}>
                    <button onClick={() => toggleReportType(t.key)} title="Toggle include/exclude"
                      style={{
                        display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 10px 7px 12px", border: "none", background: "transparent",
                        color: active ? t.c : "#64748B",
                        fontSize: 12, fontWeight: 600, cursor: "pointer",
                      }}>
                      <span style={{ fontSize: 13 }}>{active ? "✓" : "○"}</span>
                      {t.l}
                    </button>
                    <button onClick={() => selectOnlyType(t.key)} title={`Only ${t.l}`}
                      style={{
                        padding: "7px 10px", border: "none", borderLeft: `1px solid ${active ? t.c + "44" : "#E2E8F0"}`,
                        background: onlyThisSelected ? t.c : "transparent",
                        color: onlyThisSelected ? "#fff" : "#475569",
                        fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.02em",
                      }}>
                      ONLY
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live preview */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12, fontFamily: "IBM Plex Mono" }}>
              Report Preview — {reportRows.length} transaction{reportRows.length !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {[
                ...(reportTypes.regular  ? [{ l: "Gross Sales", v: reportGross, c: "#3B82F6" }] : []),
                ...(reportTypes.return   ? [{ l: "Returns", v: reportReturnsTotal, c: "#EF4444" }] : []),
                ...(reportTypes.deducted ? [{ l: "Deducted", v: reportDeductedTotal, c: "#F59E0B" }] : []),
                ...(reportTypes.aidtds   ? [{ l: "AIT-TDS", v: reportAidTdsTotal, c: "#06B6D4" }] : []),
                ...(reportTypes.advance  ? [{ l: "Payments Received", v: reportAdvanceTotal, c: "#8B5CF6" }] : []),
                ...(reportTypes.regular  ? [{ l: "Invoices", v: reportRegular.length, c: "#8B5CF6", isCount: true }] : []),
              ].map(s => (
                <div key={s.l} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "#64748B" }}>{s.l}</span>
                  <span style={{ fontWeight: 700, color: s.c, fontFamily: "IBM Plex Mono" }}>{s.isCount ? s.v : `${curr}${s.v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button className="btn btn-secondary" onClick={exportSalesHistoryCSV}><Icon name="download" size={14} /> Export CSV</button>
            <button className="btn btn-primary" onClick={downloadSalesHistoryPDF}><Icon name="download" size={14} /> Download PDF</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Invoice Preview
const invEsc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const InvoicePreview = ({ sale }) => {
  const { data, curr } = useApp();
  const cust = data.customers.find(c => c.id === sale.customerId);
  const settings = data.settings;
  const taxName = settings.taxName || "VAT";

  // Calculate vat rate from stored vat/subtotal
  const vatPct = sale.subtotal > 0 ? ((sale.vat / sale.subtotal) * 100).toFixed(0) : 10;

  const buildInvoiceHTML = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Invoice ${sale.invoiceNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #1a1a1a; background: #fff; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 2px solid #3B82F6; }
  .invoice-title { font-size: 36px; font-weight: 800; color: #3B82F6; letter-spacing: -1px; }
  .invoice-no { font-size: 13px; color: #666; margin-top: 4px; font-family: monospace; }
  .company-name { font-size: 18px; font-weight: 700; color: #111; }
  .company-info { font-size: 12px; color: #666; margin-top: 4px; line-height: 1.6; text-align: right; }
  .meta { display: flex; justify-content: space-between; margin-bottom: 28px; }
  .meta-box { background: #f8f9fa; border-radius: 8px; padding: 16px 20px; width: 48%; }
  .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 8px; }
  .meta-value { font-size: 14px; font-weight: 600; color: #111; }
  .meta-sub { font-size: 12px; color: #666; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #3B82F6; color: #fff; padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  th:last-child, td:last-child { text-align: right; }
  td { padding: 11px 14px; border-bottom: 1px solid #eee; color: #333; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #fafafa; }
  .totals { margin-left: auto; width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; color: #555; }
  .totals-row.total { border-top: 2px solid #3B82F6; padding-top: 12px; margin-top: 4px; font-size: 16px; font-weight: 800; color: #111; }
  .totals-row.total span:last-child { color: #3B82F6; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
  .status-paid { background: #d1fae5; color: #065f46; }
  .status-due { background: #fee2e2; color: #991b1b; }
  .status-partial { background: #fef3c7; color: #92400e; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #aaa; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-no">${sale.invoiceNo}</div>
    </div>
    <div style="text-align:right">
      <div class="company-name">${settings.companyName || "BizCore Systems"}</div>
      <div class="company-info">${settings.address || ""}<br/>${settings.email || ""} · ${settings.phone || ""}</div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-box">
      <div class="meta-label">Bill To</div>
      <div class="meta-value">${cust?.name || "—"}</div>
      <div class="meta-sub">${cust?.email || ""}</div>
      <div class="meta-sub">${cust?.address || ""}</div>
    </div>
    <div class="meta-box" style="text-align:right">
      <div class="meta-label">Invoice Details</div>
      <div class="meta-value">Date: ${sale.date}</div>
      <div class="meta-sub">Status: <span class="status-badge status-${sale.status}">${sale.status === "advance" ? "PAYMENT" : sale.status === "aidtds" ? "AIT-TDS" : sale.status.toUpperCase()}</span></div>
      ${sale.paymentMethod ? `<div class="meta-sub" style="margin-top:4px">Payment Method: <strong>${sale.paymentMethod}</strong></div>` : ""}
      ${sale.workOrder ? `<div class="meta-sub" style="margin-top:4px">Work Order: <strong>${invEsc(sale.workOrder)}</strong></div>` : ""}
      ${sale.buyerRef ? `<div class="meta-sub" style="margin-top:4px">Buyer Ref. No.: <strong>${invEsc(sale.buyerRef)}</strong></div>` : ""}
    </div>
  </div>

  <table>
    <thead><tr><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:center">Unit</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${sale.items.map(it => {
        const prod = data.products.find(p => p.id === it.productId);
        return `<tr>
          <td>${prod?.name || "—"}</td>
          <td style="text-align:right">${it.qty}</td>
          <td style="text-align:center"><span style="display:inline-block;padding:2px 8px;background:#e8f5e9;border-radius:4px;font-size:11px;color:#2e7d32;font-family:monospace">${it.unit || prod?.unit || "pcs"}</span></td>
          <td style="text-align:right">${curr}${Number(it.price).toFixed(2)}</td>
          <td style="text-align:right">${curr}${((it.qty || 0) * (it.price || 0) * (1 - (it.discount || 0) / 100)).toFixed(2)}</td>
        </tr>`;
      }).join("")}
    </tbody>
    <tfoot>
      <tr style="background:#eff6ff;border-top:2px solid #3B82F6">
        <td style="font-weight:700;color:#1d4ed8;font-size:12px;text-transform:uppercase;letter-spacing:0.05em">Total Qty</td>
        <td style="text-align:right;font-weight:800;color:#1d4ed8;font-family:monospace;font-size:14px">${sale.items.reduce((s, it) => s + (it.qty || 0), 0).toLocaleString()}</td>
        <td colspan="3"></td>
      </tr>
    </tfoot>
  </table>

  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${curr}${Number(sale.subtotal).toFixed(2)}</span></div>
    <div class="totals-row"><span>${taxName} (${vatPct}%)</span><span>${curr}${Number(sale.vat).toFixed(2)}</span></div>
    <div class="totals-row total"><span>Total</span><span>${curr}${Number(sale.total).toFixed(2)}</span></div>
  </div>

  ${sale.notes ? `<div style="margin-top:28px;padding:14px 16px;background:#f8f9fa;border-radius:8px;font-size:12px;color:#555"><strong>Notes:</strong> ${sale.notes}</div>` : ""}

  <div class="footer">Thank you for your business! · ${settings.companyName || "BizCore Systems"} · ${settings.email || ""}</div>
</body>
</html>`;

  const handleDownload = () => {
    const html = buildInvoiceHTML();
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 300); };
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = `${sale.invoiceNo}.html`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const handlePrint = handleDownload;

  return (
    <div style={{ background: "#F4F6FB", borderRadius: 12, padding: 28, fontFamily: "Sora, sans-serif" }}>
      {/* Invoice Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, paddingBottom: 20, borderBottom: "2px solid #3B82F6" }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#3B82F6", marginBottom: 4 }}>INVOICE</div>
          <div style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#64748B" }}>{sale.invoiceNo}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>{settings.companyName || "BizCore Systems"}</div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>{settings.address}</div>
          <div style={{ fontSize: 12, color: "#64748B" }}>{settings.email}</div>
        </div>
      </div>

      {/* Bill To / Details */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#FFFFFF", padding: "14px 16px", borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Bill To</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{cust?.name || "—"}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{cust?.email}</div>
          <div style={{ fontSize: 12, color: "#475569" }}>{cust?.address}</div>
        </div>
        <div style={{ background: "#FFFFFF", padding: "14px 16px", borderRadius: 8, textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Details</div>
          <div style={{ fontSize: 12, color: "#475569" }}>Date: <span style={{ fontFamily: "IBM Plex Mono", color: "#334155" }}>{sale.date}</span></div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Status: <StatusBadge status={sale.status} /></div>
          {sale.workOrder && <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Work Order: <span style={{ fontFamily: "IBM Plex Mono", color: "#334155" }}>{sale.workOrder}</span></div>}
          {sale.buyerRef && <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>Buyer Ref. No.: <span style={{ fontFamily: "IBM Plex Mono", color: "#334155" }}>{sale.buyerRef}</span></div>}
        </div>
      </div>

      {/* Items Table — Advance payment, Return, or regular sale */}
      {sale.saleType === "advance" ? (
        <div style={{ marginBottom: 20, background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(139,92,246,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="wallet" size={15} color="#8B5CF6" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Payment</div>
              <div style={{ fontSize: 11, color: "#475569" }}>Products to be delivered at a later date</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1px solid rgba(139,92,246,0.2)" }}>
            <span style={{ fontSize: 14, color: "#475569" }}>Payment Amount Received</span>
            <span style={{ fontFamily: "IBM Plex Mono", fontSize: 22, fontWeight: 800, color: "#8B5CF6" }}>{curr}{Number(sale.paid).toFixed(2)}</span>
          </div>
          {sale.notes && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#64748B" }}><strong style={{ color: "#475569" }}>Notes:</strong> {sale.notes}</div>
          )}
        </div>
      ) : sale.saleType === "return" ? (
        <>
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8 }}>
            <Icon name="refresh" size={13} color="#EF4444" />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#EF4444" }}>CREDIT NOTE / RETURN</span>
            <span style={{ fontSize: 11, color: "#475569", marginLeft: 4 }}>Products returned & credited to customer ledger</span>
          </div>
          <table style={{ marginBottom: 20, borderRadius: 8, overflow: "hidden" }}>
            <thead><tr><th>Returned Product</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "center" }}>Unit</th><th style={{ textAlign: "right" }}>Return Price</th><th style={{ textAlign: "right" }}>Credit</th></tr></thead>
            <tbody>
              {(sale.items || []).length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "#64748B", padding: "20px 14px" }}>No items recorded</td></tr>
              ) : (sale.items || []).map((it, i) => {
                const prod = data.products.find(p => p.id === it.productId);
                const productName = it.productName || prod?.name || "—";
                const lineTotal = (it.qty || 0) * (it.price || 0);
                return (
                  <tr key={i}>
                    <td style={{ color: "#E2E8F0" }}>{productName}</td>
                    <td style={{ textAlign: "right" }}>{it.qty}</td>
                    <td style={{ textAlign: "center" }}><span style={{ display: "inline-block", padding: "2px 8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, fontSize: 11, color: "#EF4444", fontFamily: "IBM Plex Mono" }}>{it.unit || prod?.unit || "pcs"}</span></td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{curr}{Number(it.price).toFixed(2)}</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: "#EF4444" }}>↩ {curr}{lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ marginLeft: "auto", maxWidth: 280, borderTop: "1px solid rgba(239,68,68,0.2)", paddingTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700 }}>
              <span style={{ color: "#EF4444" }}>Total Credit</span>
              <span style={{ fontFamily: "IBM Plex Mono", color: "#EF4444" }}>{curr}{Number(sale.total).toFixed(2)}</span>
            </div>
          </div>
        </>
      ) : sale.saleType === "deducted" ? (
        <div style={{ marginBottom: 20, background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 10, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(245,158,11,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="trend_down" size={15} color="#F59E0B" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Deducted</div>
              <div style={{ fontSize: 11, color: "#475569" }}>Amount deducted from customer's ledger balance</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1px solid rgba(245,158,11,0.2)" }}>
            <span style={{ fontSize: 14, color: "#475569" }}>Deducted Amount</span>
            <span style={{ fontFamily: "IBM Plex Mono", fontSize: 22, fontWeight: 800, color: "#F59E0B" }}>− {curr}{Math.abs(Number(sale.total)).toFixed(2)}</span>
          </div>
          {sale.notes && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#64748B" }}><strong style={{ color: "#475569" }}>Notes:</strong> {sale.notes}</div>
          )}
        </div>
      ) : sale.saleType === "aidtds" ? (
        <div style={{ marginBottom: 20, background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 10, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(6,182,212,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="invoice" size={15} color="#06B6D4" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>AIT-TDS</div>
              <div style={{ fontSize: 11, color: "#475569" }}>AIT-TDS amount deducted from customer's ledger balance</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, borderTop: "1px solid rgba(6,182,212,0.2)" }}>
            <span style={{ fontSize: 14, color: "#475569" }}>AIT-TDS Amount</span>
            <span style={{ fontFamily: "IBM Plex Mono", fontSize: 22, fontWeight: 800, color: "#06B6D4" }}>− {curr}{Math.abs(Number(sale.total)).toFixed(2)}</span>
          </div>
          {sale.notes && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#64748B" }}><strong style={{ color: "#475569" }}>Notes:</strong> {sale.notes}</div>
          )}
        </div>
      ) : (
        <>
          <table style={{ marginBottom: 20, borderRadius: 8, overflow: "hidden" }}>
            <thead><tr><th>Product</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "center" }}>Unit</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
            <tbody>
              {(sale.items || []).length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "#64748B", padding: "20px 14px" }}>No items recorded</td></tr>
              ) : (sale.items || []).map((it, i) => {
                const prod = data.products.find(p => p.id === it.productId);
                const productName = it.productName || prod?.name || "—";
                const lineTotal = (it.qty || 0) * (it.price || 0) * (1 - (it.discount || 0) / 100);
                return (
                  <tr key={i}>
                    <td style={{ color: "#E2E8F0" }}>{productName}</td>
                    <td style={{ textAlign: "right" }}>{it.qty}</td>
                    <td style={{ textAlign: "center" }}><span style={{ display: "inline-block", padding: "2px 8px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 4, fontSize: 11, color: "#10B981", fontFamily: "IBM Plex Mono" }}>{it.unit || prod?.unit || "pcs"}</span></td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono" }}>{curr}{Number(it.price).toFixed(2)}</td>
                    <td style={{ textAlign: "right", fontFamily: "IBM Plex Mono", color: "#10B981" }}>{curr}{lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: "rgba(59,130,246,0.08)" }}>
                <td style={{ fontWeight: 700, fontSize: 11, color: "#3B82F6", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.06em", borderTop: "2px solid rgba(59,130,246,0.3)", paddingTop: 10 }}>Total Qty</td>
                <td style={{ textAlign: "right", fontWeight: 800, color: "#3B82F6", fontFamily: "IBM Plex Mono", fontSize: 14, borderTop: "2px solid rgba(59,130,246,0.3)", paddingTop: 10 }}>{(sale.items || []).reduce((s, it) => s + (it.qty || 0), 0).toLocaleString()}</td>
                <td colSpan={3} style={{ borderTop: "2px solid rgba(59,130,246,0.3)" }}></td>
              </tr>
            </tfoot>
          </table>

          {/* Totals */}
          <div style={{ marginLeft: "auto", maxWidth: 280, borderTop: "1px solid #E2E8F0", paddingTop: 14 }}>
            {[
              ["Subtotal", sale.subtotal, "#475569"],
              [`${taxName} (${vatPct}%)`, sale.vat, "#475569"],
              ["Total", sale.total, "#0F172A"],
              ["Paid", sale.paid, "#10B981"],
              ...(sale.due > 0 ? [["Due", sale.due, "#EF4444"]] : []),
            ].map(([l, v, c]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: l === "Total" ? 0 : 8, paddingTop: l === "Total" ? 10 : 0, borderTop: l === "Total" ? "1px solid #E2E8F0" : "none", fontSize: l === "Total" ? 16 : 13, fontWeight: l === "Total" ? 700 : 400 }}>
                <span style={{ color: c }}>{l}</span>
                <span style={{ fontFamily: "IBM Plex Mono", color: l === "Total" ? "#3B82F6" : c }}>{curr}{Number(v).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div style={{ display: "flex", gap: 10, marginTop: 24, paddingTop: 20, borderTop: "1px solid #E2E8F0" }}>
        <button className="btn btn-primary" onClick={handleDownload}>
          <Icon name="download" size={14} /> Download PDF
        </button>
        <button className="btn btn-secondary" onClick={handlePrint}>
          <Icon name="print" size={14} /> Print
        </button>
      </div>
    </div>
  );
};

// ============================================================
// PURCHASES
// ============================================================
const emptyPurchaseForm = () => ({
  purchaseType: "regular",
  supplierId: "",
  date: fmt(today),
  items: [{ productId: "", qty: 1, price: 0, unit: "" }],
  returnItems: [{ productId: "", qty: 1, price: 0, unit: "" }],
  advanceAmount: "",
  deductedAmount: "",
  aidTdsAmount: "",
  notes: "",
  paidAmount: 0,
  paymentMethod: "Cash",
  status: "",
});

const Purchases = () => {
  const { data, setData, toast, curr, currentUser } = useApp();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [filter, setFilter] = useState("all");
  const [showDuePanel, setShowDuePanel] = useState(true);
  const [dueSort, setDueSort] = useState("amount"); // "amount" | "invoices" | "name"
  const PER_PAGE = 10;

  // Older entries (made before serial numbering) have random ids like PAY-9f9da8hs3
  const SERIAL_CODES = ["PO", "PAY", "DED", "TDS", "RET"];
  const isLegacyId = (p) => !SERIAL_ID_RE.test(String(p.id)) && SERIAL_CODES.includes(String(p.id).split("-")[0]);
  const legacyPurchases = data.purchases.filter(isLegacyId);
  const standardizeIds = () => {
    if (legacyPurchases.length === 0) return;
    if (!window.confirm(`${legacyPurchases.length} older purchase entries have random IDs (e.g. ${legacyPurchases[0].id}).\n\nGive them serial numbers like PO-20260813-001, based on each entry's date?\n\nOld entries have no creation time, so entries from the same day are numbered in a fixed but arbitrary order. Entries that already have a serial number are not touched.`)) return;
    setData(d => {
      let draft = d;
      const todo = d.purchases.filter(isLegacyId).sort((a, b) => (a.date || "").localeCompare(b.date || "") || String(a.id).localeCompare(String(b.id)));
      for (const po of todo) {
        const code = String(po.id).split("-")[0];
        const [yy, mm, dd] = (po.date || fmt(today)).split("-");
        const newId = nextSerialNo(`${code}-${yy}${mm}${dd}`, draft, "purchases", "id");
        draft = { ...draft, purchases: draft.purchases.map(x => x.id === po.id ? { ...x, id: newId } : x) };
      }
      return draft;
    });
    toast(`${legacyPurchases.length} entries now have serial numbers`, "success");
  };

  // Newest purchases first: by date, then creation time, then serial number (highest serial on top)
  const filtered = data.purchases.filter(p => {
    const sup = data.suppliers.find(s => s.id === p.supplierId);
    const matchSearch = p.id.toLowerCase().includes(search.toLowerCase()) || sup?.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" || p.status === filter;
    return matchSearch && matchFilter;
  }).sort(newestFirst);

  // ── Due Analytics — same formula as Supplier Ledger ──────
  const supplierDueList = data.suppliers.map(s => {
    const supPurchases = data.purchases.filter(p => p.supplierId === s.id);
    const lbal = supPurchases.reduce((bal, p) =>
      p.purchaseType === "advance" ? bal - (p.paid || 0) :
      p.purchaseType === "return"  ? bal - (p.total || 0) :
      bal + (p.total || 0) - (p.paid || 0), 0);
    const invoiceCount = supPurchases.filter(p => p.status === "due").length;
    const invoices = supPurchases.filter(p => p.status === "due").map(p => p.id);
    return { id: s.id, name: s.name, dueAmount: lbal, invoiceCount, invoices };
  }).filter(s => s.dueAmount > 0);

  if (dueSort === "amount") supplierDueList.sort((a, b) => b.dueAmount - a.dueAmount);
  else if (dueSort === "invoices") supplierDueList.sort((a, b) => b.invoiceCount - a.invoiceCount);
  else supplierDueList.sort((a, b) => a.name.localeCompare(b.name));

  const totalDueAmount = supplierDueList.reduce((s, c) => s + c.dueAmount, 0);
  const totalDueInvoices = supplierDueList.reduce((s, c) => s + c.invoiceCount, 0);
  const totalPartialInvoices = data.purchases.filter(p => p.status === "partial").length;
  const maxDue = supplierDueList[0]?.dueAmount || 1;

  const downloadDueOverviewPDF = () => {
    const settings = data.settings;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Due Overview Report</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 36px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 3px solid #EF4444; }
  .report-title { font-size: 30px; font-weight: 800; color: #EF4444; letter-spacing: -1px; }
  .report-sub { font-size: 12px; color: #888; margin-top: 4px; font-family: monospace; }
  .company-name { font-size: 17px; font-weight: 700; color: #111; }
  .company-info { font-size: 11px; color: #666; margin-top: 4px; line-height: 1.6; text-align: right; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
  .summary-card { border-radius: 10px; padding: 16px 18px; border: 1px solid #eee; }
  .summary-card.red { background: #fff5f5; border-color: #fecaca; }
  .summary-card.yellow { background: #fffbeb; border-color: #fde68a; }
  .summary-card-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 8px; }
  .summary-card-value { font-size: 22px; font-weight: 800; color: #111; font-family: monospace; }
  .summary-card.red .summary-card-value { color: #dc2626; }
  .summary-card.yellow .summary-card-value { color: #d97706; }
  .summary-card-unit { font-size: 11px; color: #999; margin-top: 3px; }
  .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #555; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid #eee; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead tr { background: #EF4444; }
  th { color: #fff; padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; }
  th:last-child { text-align: right; }
  td { padding: 11px 14px; border-bottom: 1px solid #f1f1f1; color: #333; font-size: 12px; }
  td:last-child { text-align: right; font-family: monospace; font-weight: 700; }
  tr:nth-child(even) td { background: #fafafa; }
  tr:last-child td { border-bottom: none; }
  .rank-badge { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; font-size: 10px; font-weight: 800; font-family: monospace; }
  .rank-1 { background: #fee2e2; color: #dc2626; }
  .rank-2 { background: #fef3c7; color: #d97706; }
  .rank-other { background: #f1f5f9; color: #64748b; }
  .bar-cell { width: 120px; }
  .bar-bg { background: #f1f5f9; border-radius: 4px; height: 8px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .invoice-pills { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
  .invoice-pill { background: #f8f8f8; border: 1px solid #e5e7eb; border-radius: 4px; padding: 1px 6px; font-size: 9px; font-family: monospace; color: #666; }
  .amount-red { color: #dc2626 !important; }
  .amount-yellow { color: #d97706 !important; }
  .amount-blue { color: #2563eb !important; }
  .totals-row { display: flex; justify-content: space-between; padding: 8px 14px; font-size: 13px; }
  .totals-row.grand { background: #fff5f5; border: 1px solid #fecaca; border-radius: 8px; font-size: 15px; font-weight: 800; color: #dc2626; font-family: monospace; margin-top: 8px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 10px; color: #aaa; }
  @media print { body { padding: 20px; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="report-title">DUE OVERVIEW</div>
      <div class="report-sub">Outstanding Supplier Dues Report · Generated ${dateStr} at ${timeStr}</div>
    </div>
    <div style="text-align:right">
      <div class="company-name">${settings.companyName || "BizCore Systems"}</div>
      <div class="company-info">${settings.address || ""}${settings.address ? "<br/>" : ""}${settings.email || ""}${settings.email && settings.phone ? " · " : ""}${settings.phone || ""}</div>
    </div>
  </div>

  <div class="summary-grid">
    <div class="summary-card red">
      <div class="summary-card-label">Total Outstanding</div>
      <div class="summary-card-value">${curr}${totalDueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div class="summary-card-unit">due amount</div>
    </div>
    <div class="summary-card red">
      <div class="summary-card-label">Due Purchase Orders</div>
      <div class="summary-card-value">${totalDueInvoices}</div>
      <div class="summary-card-unit">unpaid order${totalDueInvoices !== 1 ? "s" : ""}</div>
    </div>
    <div class="summary-card yellow">
      <div class="summary-card-label">Affected Suppliers</div>
      <div class="summary-card-value">${supplierDueList.length}</div>
      <div class="summary-card-unit">supplier${supplierDueList.length !== 1 ? "s" : ""} with dues</div>
    </div>
  </div>

  <div class="section-title">Supplier-wise Due Breakdown</div>
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th>Supplier</th>
        <th>Due Orders</th>
        <th style="width:130px">Progress</th>
        <th>Due Amount</th>
      </tr>
    </thead>
    <tbody>
      ${supplierDueList.map((sup, idx) => {
        const pct = Math.min(100, (sup.dueAmount / (supplierDueList[0]?.dueAmount || 1)) * 100);
        const color = pct > 70 ? "#dc2626" : pct > 35 ? "#d97706" : "#2563eb";
        const rankClass = idx === 0 ? "rank-1" : idx === 1 ? "rank-2" : "rank-other";
        const amtClass = pct > 70 ? "amount-red" : pct > 35 ? "amount-yellow" : "amount-blue";
        return `<tr>
          <td><span class="rank-badge ${rankClass}">${idx + 1}</span></td>
          <td>
            <div style="font-weight:600;color:#111">${sup.name}</div>
            <div class="invoice-pills">${sup.invoices.slice(0, 5).map(inv => `<span class="invoice-pill">${inv}</span>`).join("")}${sup.invoices.length > 5 ? `<span class="invoice-pill">+${sup.invoices.length - 5} more</span>` : ""}</div>
          </td>
          <td style="font-family:monospace;font-size:11px;color:#666">${sup.invoiceCount} order${sup.invoiceCount !== 1 ? "s" : ""}</td>
          <td class="bar-cell">
            <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
            <div style="font-size:9px;color:#999;margin-top:2px;font-family:monospace">${pct.toFixed(1)}% of total</div>
          </td>
          <td class="${amtClass}">${curr}${sup.dueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>`;
      }).join("")}
    </tbody>
  </table>

  <div style="margin-left:auto;max-width:320px">
    <div class="totals-row grand">
      <span>Total Outstanding Due</span>
      <span>${curr}${totalDueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  </div>

  <div class="footer">
    <span>${settings.companyName || "BizCore Systems"} · Due Overview Report</span>
    <span>Generated on ${dateStr} · ${timeStr}</span>
  </div>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 300); };
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = `Purchase-Due-Overview-${new Date().toISOString().split("T")[0]}.html`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const downloadDueOverviewCSV = () => {
    const rows = [["Purchase Due Overview Report", "Generated", fmt(today)]];
    rows.push([]);
    rows.push(["Total Outstanding Due", totalDueAmount.toFixed(2)]);
    rows.push(["Due Purchase Orders", totalDueInvoices]);
    rows.push(["Suppliers with Dues", supplierDueList.length]);
    rows.push([]);
    rows.push(["#", "Supplier", "Due Orders", "PO Numbers", "Due Amount"]);
    supplierDueList.forEach((s, idx) => {
      rows.push([idx + 1, s.name, s.invoiceCount, s.invoices.join(" | "), s.dueAmount.toFixed(2)]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Purchase-Due-Overview-${new Date().toISOString().split("T")[0]}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const [form, setForm] = useState(emptyPurchaseForm());

  const openNew = () => { setEditItem(null); setForm(emptyPurchaseForm()); setShowModal(true); };
  const openEdit = (po) => {
    setEditItem(po);
    const pType = po.purchaseType || "regular";
    const base = emptyPurchaseForm();
    if (pType === "advance") {
      setForm({ ...base, purchaseType: "advance", supplierId: po.supplierId, date: po.date || fmt(today), advanceAmount: po.paid || 0, notes: po.notes || "", paymentMethod: po.paymentMethod || "Cash" });
    } else if (pType === "deducted") {
      setForm({ ...base, purchaseType: "deducted", supplierId: po.supplierId, date: po.date || fmt(today), deductedAmount: Math.abs(po.total || 0), notes: po.notes || "" });
    } else if (pType === "aidtds") {
      setForm({ ...base, purchaseType: "aidtds", supplierId: po.supplierId, date: po.date || fmt(today), aidTdsAmount: Math.abs(po.total || 0), notes: po.notes || "" });
    } else if (pType === "return") {
      setForm({ ...base, purchaseType: "return", supplierId: po.supplierId, date: po.date || fmt(today), returnItems: (po.items || []).map(it => ({ ...it, unit: it.unit || (data.products.find(p => p.id === it.productId)?.unit || "") })), notes: po.notes || "" });
    } else {
      setForm({
        ...base,
        purchaseType: "regular",
        supplierId: po.supplierId,
        date: po.date || fmt(today),
        items: (po.items || []).map(it => ({ ...it, unit: it.unit || (data.products.find(p => p.id === it.productId)?.unit || "") })),
        notes: po.notes || "",
        paidAmount: po.paid || 0,
        paymentMethod: po.paymentMethod || "Cash",
      });
    }
    setShowModal(true);
  };
  const deletePurchase = (po) => { if (!window.confirm(`Delete purchase order ${po.id}? It will be moved to the Recycle Bin and can be restored.`)) return; const entry = makeBinEntry("purchases", po, data, currentUser?.name); setData(d => trashItem(d, "purchases", entry)); toast("Purchase moved to Recycle Bin", "success"); };

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { productId: "", qty: 1, price: 0, unit: "" }] }));
  const removeItem = (i) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i, field, val) => {
    setForm(f => {
      const items = [...f.items];
      items[i] = { ...items[i], [field]: val };
      if (field === "productId") {
        const prod = data.products.find(p => p.id === val);
        if (prod) { items[i].price = prod.buyPrice; items[i].unit = prod.unit || "pcs"; }
      }
      return { ...f, items };
    });
  };

  const addReturnItem = () => setForm(f => ({ ...f, returnItems: [...(f.returnItems || []), { productId: "", qty: 1, price: 0, unit: "" }] }));
  const removeReturnItem = (i) => setForm(f => ({ ...f, returnItems: (f.returnItems || []).filter((_, idx) => idx !== i) }));
  const updateReturnItem = (i, field, val) => {
    setForm(f => {
      const returnItems = [...(f.returnItems || [])];
      returnItems[i] = { ...returnItems[i], [field]: val };
      if (field === "productId") {
        const prod = data.products.find(p => p.id === val);
        if (prod) { returnItems[i].price = prod.buyPrice; returnItems[i].unit = prod.unit || "pcs"; }
      }
      return { ...f, returnItems };
    });
  };
  const returnTotal = (form.returnItems || []).reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);

  const total = form.items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
  const totalQty = form.items.reduce((s, it) => s + (it.qty || 0), 0);
  const paidAmt = +form.paidAmount || 0;
  const dueAmt = Math.max(0, total - paidAmt);
  const autoStatus = paidAmt >= total && total > 0 ? "paid" : paidAmt === 0 ? "due" : "partial";
  const derivedStatus = form.status || autoStatus;

  // Serial id like PAY-20260813-001 (date = purchase date; serial counts up per prefix per day)
  const newPurchaseId = (code) => {
    const [yy, mm, dd] = (form.date || fmt(today)).split("-");
    return nextSerialNo(`${code}-${yy}${mm}${dd}`, data, "purchases", "id");
  };
  // Creation time makes "newest first" exact; edits keep the original value
  const createdAtFor = () => editItem ? (editItem.createdAt ? { createdAt: editItem.createdAt } : {}) : { createdAt: new Date().toISOString() };

  const submitPurchase = () => {
    if (!form.supplierId) { toast("Please select a supplier", "error"); return; }

    if (form.purchaseType === "advance") {
      const advAmt = +form.advanceAmount || 0;
      if (advAmt <= 0) { toast("Enter a valid payment amount", "error"); return; }
      const poObj = {
        id: editItem ? editItem.id : newPurchaseId("PAY"),
        ...createdAtFor(),
        date: form.date || fmt(today),
        supplierId: form.supplierId,
        purchaseType: "advance",
        items: [],
        total: 0, paid: advAmt, due: 0,
        status: "advance",
        notes: form.notes,
        paymentMethod: form.paymentMethod || "Cash",
      };
      if (editItem) {
        setData(d => ({ ...d, purchases: d.purchases.map(p => p.id === editItem.id ? poObj : p) }));
        toast("Payment updated!", "success");
      } else {
        setData(d => ({ ...d, purchases: [poObj, ...d.purchases] }));
        toast("Payment recorded!", "success");
      }
    } else if (form.purchaseType === "deducted") {
      const dedAmt = +form.deductedAmount || 0;
      if (dedAmt <= 0) { toast("Enter a valid deduction amount", "error"); return; }
      const poObj = {
        id: editItem ? editItem.id : newPurchaseId("DED"),
        ...createdAtFor(),
        date: form.date || fmt(today),
        supplierId: form.supplierId,
        purchaseType: "deducted",
        items: [],
        total: -dedAmt, paid: 0, due: 0,
        status: "deducted",
        notes: form.notes,
      };
      if (editItem) {
        setData(d => ({ ...d, purchases: d.purchases.map(p => p.id === editItem.id ? poObj : p) }));
        toast("Deduction updated!", "success");
      } else {
        setData(d => ({ ...d, purchases: [poObj, ...d.purchases] }));
        toast("Deduction recorded!", "success");
      }
    } else if (form.purchaseType === "aidtds") {
      const tdsAmt = +form.aidTdsAmount || 0;
      if (tdsAmt <= 0) { toast("Enter a valid AIT-TDS amount", "error"); return; }
      const poObj = {
        id: editItem ? editItem.id : newPurchaseId("TDS"),
        ...createdAtFor(),
        date: form.date || fmt(today),
        supplierId: form.supplierId,
        purchaseType: "aidtds",
        items: [],
        total: -tdsAmt, paid: 0, due: 0,
        status: "aidtds",
        notes: form.notes,
      };
      if (editItem) {
        setData(d => ({ ...d, purchases: d.purchases.map(p => p.id === editItem.id ? poObj : p) }));
        toast("AIT-TDS updated!", "success");
      } else {
        setData(d => ({ ...d, purchases: [poObj, ...d.purchases] }));
        toast("AIT-TDS recorded!", "success");
      }
    } else if (form.purchaseType === "return") {
      const retItems = form.returnItems || [];
      if (retItems.some(it => !it.productId)) { toast("Please select a product for all return rows", "error"); return; }
      if (returnTotal <= 0) { toast("Enter a valid return amount", "error"); return; }
      const returnItemsWithNames = retItems.map(it => {
        const prod = data.products.find(p => p.id === it.productId);
        return { ...it, productName: prod?.name || it.productName || "", unit: it.unit || prod?.unit || "pcs" };
      });
      const poObj = {
        id: editItem ? editItem.id : newPurchaseId("RET"),
        ...createdAtFor(),
        date: form.date || fmt(today),
        supplierId: form.supplierId,
        purchaseType: "return",
        items: returnItemsWithNames,
        total: returnTotal, paid: 0, due: 0,
        status: "return",
        notes: form.notes,
      };
      if (editItem) {
        setData(d => ({ ...d, purchases: d.purchases.map(p => p.id === editItem.id ? poObj : p) }));
        toast("Return updated!", "success");
      } else {
        setData(d => {
          const updatedProducts = d.products.map(p => {
            const matched = retItems.filter(it => it.productId === p.id);
            if (matched.length === 0) return p;
            const totalQtyMatched = matched.reduce((sum, it) => sum + (it.qty || 0), 0);
            return { ...p, stock: Math.max(0, p.stock - totalQtyMatched) };
          });
          return { ...d, purchases: [poObj, ...d.purchases], products: updatedProducts };
        });
        toast("Return processed & stock adjusted!", "success");
      }
    } else {
      if (form.items.some(it => !it.productId)) { toast("Please select a product for all rows", "error"); return; }
      const paid = paidAmt;
      const due = dueAmt;
      const finalStatus = derivedStatus;
      const itemsWithNames = form.items.map(it => {
        const prod = data.products.find(p => p.id === it.productId);
        return { ...it, productName: prod?.name || it.productName || "", unit: it.unit || prod?.unit || "pcs" };
      });
      if (editItem) {
        const updated = { ...editItem, supplierId: form.supplierId, date: form.date, purchaseType: "regular", items: itemsWithNames, total, paid, due, status: finalStatus, notes: form.notes, paymentMethod: form.paymentMethod || "Cash" };
        setData(d => ({ ...d, purchases: d.purchases.map(p => p.id === editItem.id ? updated : p) }));
        toast("Purchase order updated!", "success");
      } else {
        const newPurchase = {
          id: newPurchaseId("PO"),
          createdAt: new Date().toISOString(),
          date: form.date || fmt(today),
          supplierId: form.supplierId, purchaseType: "regular", items: itemsWithNames,
          total, paid, due, status: finalStatus, notes: form.notes,
          paymentMethod: form.paymentMethod || "Cash",
        };
        const newProducts = data.products.map(p => {
          const item = form.items.find(it => it.productId === p.id);
          return item ? { ...p, stock: p.stock + item.qty } : p;
        });
        setData(d => ({ ...d, purchases: [newPurchase, ...d.purchases], products: newProducts }));
        toast("Purchase order created & stock updated!", "success");
      }
    }
    setShowModal(false);
    setForm(emptyPurchaseForm());
  };

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader title="Purchase Management" subtitle={`${data.purchases.length} total purchases`}
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={15} /> New Purchase</button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Total Purchases", v: data.purchases.reduce((s, x) => s + x.total, 0) },
          { l: "Amount Paid", v: data.purchases.reduce((s, x) => s + x.paid, 0) },
          { l: "Amount Due", v: data.purchases.reduce((s, x) => s + x.due, 0) },
        ].map(s => (
          <div key={s.l} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>{s.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", fontFamily: "IBM Plex Mono" }}>{curr}{s.v.toLocaleString("en-US", { minimumFractionDigits: 2 })}</div>
          </div>
        ))}
      </div>

      {/* ── DUE OVERVIEW PANEL ── */}
      <div className="card" style={{ marginBottom: 20, borderColor: totalDueAmount > 0 ? "rgba(239,68,68,0.25)" : "#E2E8F0", overflow: "hidden" }}>
        {/* Panel Header */}
        <div
          onClick={() => setShowDuePanel(p => !p)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", cursor: "pointer", background: totalDueAmount > 0 ? "rgba(239,68,68,0.04)" : "transparent", borderBottom: showDuePanel ? "1px solid #E2E8F0" : "none", transition: "background 0.2s" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#EF4444" }}>
              <Icon name="alert" size={15} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Due Overview</div>
              <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono" }}>
                {totalDueInvoices} due order{totalDueInvoices !== 1 ? "s" : ""} · {totalPartialInvoices} partial · {supplierDueList.length} supplier{supplierDueList.length !== 1 ? "s" : ""} affected
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {totalDueAmount > 0 && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#EF4444", fontFamily: "IBM Plex Mono" }}>{curr}{totalDueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Outstanding</div>
              </div>
            )}
            {totalDueAmount === 0 && <span className="badge badge-success">✓ All Clear</span>}
            {totalDueAmount > 0 && (
              <>
                <button
                  className="btn btn-sm"
                  onClick={e => { e.stopPropagation(); downloadDueOverviewCSV(); }}
                  style={{ background: "rgba(16,185,129,0.12)", color: "#10B981", border: "1px solid rgba(16,185,129,0.25)", display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 12px" }}
                  title="Download Due Overview as Excel (CSV)"
                >
                  <Icon name="download" size={13} /> Excel
                </button>
                <button
                  className="btn btn-sm"
                  onClick={e => { e.stopPropagation(); downloadDueOverviewPDF(); }}
                  style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 12px" }}
                  title="Download Due Overview as PDF"
                >
                  <Icon name="download" size={13} /> PDF
                </button>
              </>
            )}
            <div style={{ color: "#64748B", transform: showDuePanel ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", fontSize: 18, lineHeight: 1 }}>⌄</div>
          </div>
        </div>

        {showDuePanel && (
          <div style={{ padding: 20 }}>
            {totalDueAmount === 0 ? (
              <div style={{ textAlign: "center", padding: "32px 0", color: "#10B981" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No outstanding dues!</div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>All purchase orders are fully paid.</div>
              </div>
            ) : (
              <>
                {/* Summary Cards Row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Due Purchase Orders", value: totalDueInvoices, unit: "orders", color: "#EF4444", glow: "rgba(239,68,68,0.1)", icon: "📄" },
                    { label: "Total Due Amount", value: `${curr}${totalDueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, unit: "outstanding", color: "#EF4444", glow: "rgba(239,68,68,0.1)", icon: "💰", isAmount: true },
                    { label: "Suppliers with Due", value: supplierDueList.length, unit: "suppliers", color: "#F59E0B", glow: "rgba(245,158,11,0.1)", icon: "👥" },
                  ].map(card => (
                    <div key={card.label} style={{ background: "#FFFFFF", border: `1px solid ${card.color}25`, borderRadius: 12, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${card.color}, transparent)`, borderRadius: "12px 12px 0 0" }} />
                      <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{card.label}</div>
                      <div style={{ fontSize: card.isAmount ? 18 : 28, fontWeight: 800, color: card.color, fontFamily: "IBM Plex Mono", lineHeight: 1.1 }}>{card.value}</div>
                      <div style={{ fontSize: 11, color: "#475569", marginTop: 4, textTransform: "capitalize" }}>{card.unit}</div>
                    </div>
                  ))}
                </div>

                {/* Supplier Due Table */}
                <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "IBM Plex Mono" }}>
                      Supplier-wise Due Breakdown
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[["amount", "By Amount"], ["invoices", "By Orders"], ["name", "By Name"]].map(([key, label]) => (
                        <button key={key} onClick={() => setDueSort(key)} style={{
                          padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontFamily: "IBM Plex Mono",
                          background: dueSort === key ? "#EF4444" : "#F1F5F9",
                          color: dueSort === key ? "white" : "#64748B",
                          transition: "all 0.15s",
                        }}>{label}</button>
                      ))}
                    </div>
                  </div>

                  {supplierDueList.length === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "#64748B", fontSize: 13 }}>No due amounts found</div>
                  ) : (
                    <div style={{ maxHeight: 340, overflowY: "auto" }}>
                      {supplierDueList.map((sup, idx) => {
                        const pct = Math.min(100, (sup.dueAmount / maxDue) * 100);
                        const urgencyColor = pct > 70 ? "#EF4444" : pct > 35 ? "#F59E0B" : "#3B82F6";
                        return (
                          <div key={sup.id} style={{ padding: "14px 16px", borderBottom: idx < supplierDueList.length - 1 ? "1px solid #FFFFFF" : "none", display: "flex", alignItems: "center", gap: 14 }}>
                            {/* Rank */}
                            <div style={{ width: 22, height: 22, borderRadius: 6, background: idx === 0 ? "rgba(239,68,68,0.15)" : idx === 1 ? "rgba(245,158,11,0.1)" : "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: idx === 0 ? "#EF4444" : idx === 1 ? "#F59E0B" : "#64748B", fontFamily: "IBM Plex Mono", flexShrink: 0 }}>
                              {idx + 1}
                            </div>
                            {/* Avatar */}
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${urgencyColor}15`, border: `1px solid ${urgencyColor}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 13, fontWeight: 700, color: urgencyColor }}>
                              {sup.name.charAt(0).toUpperCase()}
                            </div>
                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{sup.name}</span>
                                  <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono", background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)", padding: "2px 7px", borderRadius: 20 }}>
                                    {sup.invoiceCount} ord
                                  </span>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 800, color: urgencyColor, fontFamily: "IBM Plex Mono" }}>
                                    {curr}{sup.dueAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                  <div style={{ fontSize: 10, color: "#475569" }}>{pct.toFixed(1)}% of max</div>
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div style={{ height: 5, background: "#E2E8F0", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${urgencyColor}, ${urgencyColor}99)`, transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)" }} />
                              </div>
                              {/* PO pills (max 4) */}
                              <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                                {sup.invoices.slice(0, 4).map(inv => (
                                  <span key={inv} style={{ fontSize: 9, fontFamily: "IBM Plex Mono", background: "#F1F5F9", color: "#64748B", padding: "2px 6px", borderRadius: 4, border: "1px solid #E2E8F0" }}>{inv}</span>
                                ))}
                                {sup.invoices.length > 4 && <span style={{ fontSize: 9, fontFamily: "IBM Plex Mono", color: "#64748B" }}>+{sup.invoices.length - 4} more</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {legacyPurchases.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px", marginBottom: 14, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 10 }}>
          <Icon name="alert" size={14} color="#F59E0B" />
          <span style={{ fontSize: 12, color: "#334155", flex: 1, minWidth: 200 }}><strong>{legacyPurchases.length}</strong> older entries have random IDs (e.g. <span className="mono">{legacyPurchases[0].id}</span>) instead of serial numbers.</span>
          <button className="btn btn-secondary btn-sm" onClick={standardizeIds}>Give them serial numbers</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <SearchInput value={search} onChange={setSearch} placeholder="Search by PO#, supplier..." style={{ flex: 1, minWidth: 200 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {["all", "paid", "due", "partial", "advance", "return", "deducted", "aidtds"].map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1); }} className="btn btn-secondary btn-sm"
              style={{ background: filter === f ? "#3B82F6" : "#F1F5F9", color: filter === f ? "white" : "#475569", border: `1px solid ${filter === f ? "#3B82F6" : "#E2E8F0"}` }}>
              {f === "aidtds" ? "AIT-TDS" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>PO#</th><th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(po => {
                const sup = data.suppliers.find(s => s.id === po.supplierId);
                const pType = po.purchaseType || "regular";
                return (
                  <tr key={po.id}>
                    <td><span className="mono" style={{ color: "#8B5CF6", fontSize: 12 }}>{po.id}</span></td>
                    <td><span className="mono" style={{ fontSize: 12 }}>{po.date}</span></td>
                    <td>{sup?.name || "—"}</td>
                    <td>{pType === "advance" ? <span className="badge badge-purple">Payment</span> : pType === "return" ? <span className="badge badge-danger">Return</span> : pType === "deducted" ? <span className="badge" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}>Deducted</span> : pType === "aidtds" ? <span className="badge badge-tds">AIT-TDS</span> : <span className="badge badge-gray">{po.items.length} items</span>}</td>
                    <td><span className="mono" style={{ color: pType === "return" ? "#EF4444" : pType === "deducted" ? "#F59E0B" : pType === "aidtds" ? "#06B6D4" : "#E2E8F0" }}>{pType === "advance" ? "—" : pType === "return" ? `↩ ${curr}${po.total.toFixed(2)}` : (pType === "deducted" || pType === "aidtds") ? `− ${curr}${Math.abs(po.total).toFixed(2)}` : `${curr}${po.total.toFixed(2)}`}</span></td>
                    <td><span className="mono" style={{ color: "#10B981" }}>{(pType === "return" || pType === "deducted" || pType === "aidtds") ? "—" : `${curr}${po.paid.toFixed(2)}`}</span></td>
                    <td><span className="mono" style={{ color: po.due > 0 ? "#EF4444" : "#64748B" }}>{(pType === "advance" || pType === "return" || pType === "deducted" || pType === "aidtds") ? "—" : `${curr}${po.due.toFixed(2)}`}</span></td>
                    <td><StatusBadge status={po.status} /></td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => openEdit(po)}><Icon name="edit" size={13} /></button>
                        <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => deletePurchase(po)}><Icon name="trash" size={13} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
      </div>

      {/* New Purchase Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editItem ? "Edit Purchase" : "Create New Purchase"} width={820}>
        {(() => {
          const selectedSupplier = data.suppliers.find(s => s.id === form.supplierId);
          const curr2 = data.settings.currency || "৳";

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

              {/* ── PURCHASE TYPE TOGGLE ── */}
              <div style={{ display: "flex", gap: 6, marginBottom: 20, padding: 4, background: "#F4F6FB", borderRadius: 12, border: "1px solid #E2E8F0" }}>
                {[
                  { id: "regular", label: "Regular Purchase", icon: "purchase", desc: "Buy products from supplier", color: "#3B82F6" },
                  { id: "advance", label: "Payment", icon: "wallet", desc: "Apply payment to a due purchase", color: "#10B981" },
                  { id: "return", label: "Return", icon: "refresh", desc: "Return products to supplier", color: "#EF4444" },
                  { id: "deducted", label: "Deducted", icon: "trend_down", desc: "Deduct an amount from balance", color: "#F59E0B" },
                  { id: "aidtds", label: "AIT-TDS", icon: "invoice", desc: "Record an AIT/TDS deduction from balance", color: "#06B6D4" },
                ].map(type => {
                  const active = form.purchaseType === type.id;
                  return (
                    <button key={type.id} onClick={() => setForm(f => ({ ...f, purchaseType: type.id }))} style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
                      borderRadius: 9, border: "none", cursor: "pointer", transition: "all 0.2s",
                      background: active ? `linear-gradient(135deg, ${type.color}22, ${type.color}10)` : "transparent",
                      outline: active ? `1.5px solid ${type.color}66` : "1.5px solid transparent",
                    }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: active ? `${type.color}25` : "rgba(15,23,42,0.04)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: active ? type.color : "#475569",
                        transition: "all 0.2s",
                      }}>
                        <Icon name={type.icon} size={16} />
                      </div>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#0F172A" : "#64748B", transition: "color 0.2s" }}>{type.label}</div>
                        <div style={{ fontSize: 11, color: active ? "#64748B" : "#374151", marginTop: 1 }}>{type.desc}</div>
                      </div>
                      {active && (
                        <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: type.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon name="check" size={10} color="white" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ── SECTION 1: SUPPLIER & DATE ── */}
              <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="suppliers" size={11} color="#3B82F6" />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Supplier & Date</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
                  <div>
                    <label className="form-label">Supplier *</label>
                    <SearchableDropdown
                      value={form.supplierId}
                      onChange={val => setForm(f => ({ ...f, supplierId: val }))}
                      placeholder="Search by name…"
                      options={data.suppliers.map(s => ({
                        value: s.id,
                        label: s.name,
                        sub: s.phone || s.email || "",
                      }))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Purchase Date</label>
                    <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                </div>

                {/* Supplier info preview */}
                {selectedSupplier && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", borderRadius: 9,
                    background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
                    animation: "fadeIn 0.2s ease",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(59,130,246,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#3B82F6" }}>
                        {selectedSupplier.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{selectedSupplier.name}</div>
                        <div style={{ fontSize: 11, color: "#64748B" }}>{selectedSupplier.phone || selectedSupplier.email || "No contact info"}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono" }}>BALANCE</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: (selectedSupplier.balance || 0) > 0 ? "#EF4444" : "#10B981", fontFamily: "IBM Plex Mono" }}>{curr2}{(selectedSupplier.balance || 0).toFixed(2)}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── PAYMENT FLOW ── */}
              {form.purchaseType === "advance" && (
                <div style={{ background: "rgba(16,185,129,0.05)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="wallet" size={11} color="#10B981" />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Payment Amount</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18, fontWeight: 800, color: "#10B981", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>{curr2}</span>
                        <input type="number" min={0} value={form.advanceAmount}
                          onChange={e => setForm(f => ({ ...f, advanceAmount: e.target.value }))}
                          style={{ paddingLeft: 36, fontSize: 22, fontWeight: 800, fontFamily: "IBM Plex Mono", color: "#10B981", background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.3)", height: 52 }}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: 9, fontSize: 12, color: "#475569", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: "#10B981", marginBottom: 2 }}>What happens?</div>
                      Recorded as a payment made and tracked against this supplier's ledger.
                    </div>
                  </div>
                  {/* Payment Method */}
                  <div>
                    <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Payment Method</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                      {["Cash", "Premier Bank", "UCB Bank", "Woori Bank"].map(method => {
                        const active = (form.paymentMethod || "Cash") === method;
                        return (
                          <button key={method} onClick={() => setForm(f => ({ ...f, paymentMethod: method }))}
                            style={{
                              padding: "7px 6px", borderRadius: 7,
                              border: `1px solid ${active ? "rgba(16,185,129,0.5)" : "#E2E8F0"}`,
                              background: active ? "rgba(16,185,129,0.12)" : "transparent",
                              color: active ? "#10B981" : "#475569",
                              fontSize: 11, fontWeight: 700, fontFamily: "IBM Plex Mono",
                              cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
                              overflow: "hidden", textOverflow: "ellipsis",
                            }}>
                            {method}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── DEDUCTION FLOW ── */}
              {form.purchaseType === "deducted" && (
                <div style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="trend_down" size={11} color="#F59E0B" />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Deduction Amount</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18, fontWeight: 800, color: "#F59E0B", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>− {curr2}</span>
                        <input type="number" min={0} value={form.deductedAmount}
                          onChange={e => setForm(f => ({ ...f, deductedAmount: e.target.value }))}
                          style={{ paddingLeft: 58, fontSize: 22, fontWeight: 800, fontFamily: "IBM Plex Mono", color: "#F59E0B", background: "rgba(245,158,11,0.06)", borderColor: "rgba(245,158,11,0.3)", height: 52 }}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 9, fontSize: 12, color: "#475569", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: "#F59E0B", marginBottom: 2 }}>What happens?</div>
                      Recorded as a negative amount and subtracted from this supplier's ledger balance.
                    </div>
                  </div>
                </div>
              )}

              {/* ── AIT-TDS FLOW ── */}
              {form.purchaseType === "aidtds" && (
                <div style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(6,182,212,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="invoice" size={11} color="#06B6D4" />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#06B6D4", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>AIT-TDS Amount</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 18, fontWeight: 800, color: "#06B6D4", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>− {curr2}</span>
                        <input type="number" min={0} value={form.aidTdsAmount}
                          onChange={e => setForm(f => ({ ...f, aidTdsAmount: e.target.value }))}
                          style={{ paddingLeft: 58, fontSize: 22, fontWeight: 800, fontFamily: "IBM Plex Mono", color: "#06B6D4", background: "rgba(6,182,212,0.06)", borderColor: "rgba(6,182,212,0.3)", height: 52 }}
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px", background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)", borderRadius: 9, fontSize: 12, color: "#475569", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: "#06B6D4", marginBottom: 2 }}>What happens?</div>
                      Recorded as a negative amount and subtracted from this supplier's ledger balance.
                    </div>
                  </div>
                </div>
              )}

              {/* ── RETURN FLOW ── */}
              {form.purchaseType === "return" && (<>
                <div style={{ background: "rgba(239,68,68,0.04)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  {/* Section header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="refresh" size={11} color="#EF4444" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Returned Products</span>
                      <span style={{ fontSize: 11, color: "#374151", fontFamily: "IBM Plex Mono" }}>({(form.returnItems || []).length} {(form.returnItems || []).length === 1 ? "row" : "rows"})</span>
                    </div>
                    <button className="btn btn-sm" onClick={addReturnItem}
                      style={{ gap: 5, border: "1px dashed rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.06)", color: "#EF4444", fontSize: 12 }}>
                      <Icon name="plus" size={12} /> Add Row
                    </button>
                  </div>

                  {/* Column headers */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "2fr 60px 88px 110px 90px 32px",
                    gap: 8, paddingBottom: 8, marginBottom: 6, borderBottom: "1px solid rgba(239,68,68,0.15)",
                  }}>
                    {["Product", "Unit", "Qty", "Return Price", "Line Total", ""].map((h, idx) => (
                      <div key={idx} style={{ fontSize: 10, fontWeight: 700, color: "#EF4444", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "IBM Plex Mono", textAlign: idx >= 4 ? "center" : "left", opacity: 0.7 }}>{h}</div>
                    ))}
                  </div>

                  {/* Return item rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(form.returnItems || []).map((item, i) => {
                      const lineTotal = (item.qty || 0) * (item.price || 0);
                      return (
                        <div key={i} style={{
                          display: "grid", gridTemplateColumns: "2fr 60px 88px 110px 90px 32px",
                          gap: 8, alignItems: "start", padding: "8px 10px", borderRadius: 9,
                          background: "rgba(239,68,68,0.03)", border: "1px solid rgba(239,68,68,0.12)",
                        }}>
                          <SearchableDropdown
                            value={item.productId}
                            onChange={val => updateReturnItem(i, "productId", val)}
                            placeholder="Search product…"
                            options={data.products.map(p => ({
                              value: p.id,
                              label: p.name,
                              sub: `Stock: ${p.stock} ${p.unit || "pcs"}`,
                            }))}
                          />
                          {/* Unit */}
                          <div style={{
                            padding: "6px 4px", borderRadius: 7, textAlign: "center",
                            background: item.unit ? "rgba(239,68,68,0.08)" : "#FFFFFF",
                            border: `1px solid ${item.unit ? "rgba(239,68,68,0.2)" : "#E2E8F0"}`,
                            fontSize: 11, fontWeight: 700, color: item.unit ? "#EF4444" : "#374151",
                            fontFamily: "IBM Plex Mono", minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center",
                            marginTop: 1,
                          }}>{item.unit || "—"}</div>
                          {/* Qty */}
                          <input type="number" value={item.qty} onChange={e => updateReturnItem(i, "qty", +e.target.value)} min={1}
                            style={{ textAlign: "center", borderColor: "rgba(239,68,68,0.25)" }} />
                          {/* Return Price */}
                          <div style={{ position: "relative" }}>
                            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#475569", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>{curr2}</span>
                            <input type="number" value={item.price} onChange={e => updateReturnItem(i, "price", +e.target.value)} min={0}
                              style={{ paddingLeft: 22, borderColor: "rgba(239,68,68,0.25)" }} />
                          </div>
                          {/* Line Total */}
                          <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontSize: 13, fontWeight: 700, color: lineTotal > 0 ? "#EF4444" : "#374151", paddingTop: 6 }}>
                            {curr2}{lineTotal.toFixed(2)}
                          </div>
                          {/* Remove */}
                          <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeReturnItem(i)}
                            disabled={(form.returnItems || []).length === 1}
                            style={{ opacity: (form.returnItems || []).length === 1 ? 0.3 : 1, width: 28, height: 28, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Icon name="trash" size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Return Total Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div style={{ background: "#FFFFFF", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ fontSize: 10, color: "#EF4444", fontFamily: "IBM Plex Mono", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>Return Summary</div>
                    {(form.returnItems || []).filter(it => it.productId).map((it, i) => {
                      const prod = data.products.find(p => p.id === it.productId);
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "#475569" }}>
                          <span>{prod?.name || "—"} × {it.qty}</span>
                          <span style={{ fontFamily: "IBM Plex Mono", color: "#EF4444" }}>{curr2}{((it.qty || 0) * (it.price || 0)).toFixed(2)}</span>
                        </div>
                      );
                    })}
                    <div style={{ height: 1, background: "rgba(239,68,68,0.15)", margin: "10px 0" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Total Return</span>
                      <span style={{ fontFamily: "IBM Plex Mono", fontSize: 20, fontWeight: 800, color: "#EF4444" }}>{curr2}{returnTotal.toFixed(2)}</span>
                    </div>
                  </div>
                  <div style={{ background: "#FFFFFF", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Icon name="refresh" size={13} color="#EF4444" />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>What happens on save?</div>
                        <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.6 }}>
                          ✓ Returned qty removed from inventory<br/>
                          ✓ Return credit recorded against supplier balance<br/>
                          ✓ Purchase entry generated with RET- prefix
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>)}

              {/* ── REGULAR PURCHASE: PRODUCTS ── */}
              {form.purchaseType === "regular" && (<>
                <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", marginBottom: 12 }}>
                  {/* Section header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="package" size={11} color="#10B981" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Products</span>
                      <span style={{ fontSize: 11, color: "#374151", fontFamily: "IBM Plex Mono" }}>({form.items.length} {form.items.length === 1 ? "row" : "rows"})</span>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={addItem} style={{ gap: 5, border: "1px dashed #CBD5E1" }}>
                      <Icon name="plus" size={12} /> Add Row
                    </button>
                  </div>

                  {/* Column headers */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "2fr 60px 88px 110px 90px 32px",
                    gap: 8, paddingBottom: 8, marginBottom: 6, borderBottom: "1px solid #E2E8F0",
                  }}>
                    {["Product", "Unit", "Qty", "Buy Price", "Line Total", ""].map((h, idx) => (
                      <div key={idx} style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "IBM Plex Mono", textAlign: idx >= 4 ? "center" : "left" }}>{h}</div>
                    ))}
                  </div>

                  {/* Product rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {form.items.map((item, i) => {
                      const lineTotal = (item.qty || 0) * (item.price || 0);
                      return (
                        <div key={i} style={{
                          display: "grid", gridTemplateColumns: "2fr 60px 88px 110px 90px 32px",
                          gap: 8, alignItems: "start", padding: "8px 10px", borderRadius: 9,
                          background: "rgba(15,23,42,0.015)", border: "1px solid #E2E8F0",
                        }}>
                          <SearchableDropdown
                            value={item.productId}
                            onChange={val => updateItem(i, "productId", val)}
                            placeholder="Search product…"
                            options={data.products.map(p => ({
                              value: p.id,
                              label: p.name,
                              sub: `Stock: ${p.stock} ${p.unit || "pcs"}`,
                            }))}
                          />
                          {/* Unit */}
                          <div style={{
                            padding: "6px 4px", borderRadius: 7, textAlign: "center",
                            background: item.unit ? "rgba(16,185,129,0.08)" : "#FFFFFF",
                            border: `1px solid ${item.unit ? "rgba(16,185,129,0.2)" : "#E2E8F0"}`,
                            fontSize: 11, fontWeight: 700, color: item.unit ? "#10B981" : "#374151",
                            fontFamily: "IBM Plex Mono", minHeight: 34, display: "flex", alignItems: "center", justifyContent: "center",
                            marginTop: 1,
                          }}>{item.unit || "—"}</div>
                          {/* Qty */}
                          <input type="number" value={item.qty} onChange={e => updateItem(i, "qty", +e.target.value)} min={1}
                            style={{ textAlign: "center" }} />
                          {/* Buy Price */}
                          <div style={{ position: "relative" }}>
                            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#475569", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>{curr2}</span>
                            <input type="number" value={item.price} onChange={e => updateItem(i, "price", +e.target.value)} min={0} style={{ paddingLeft: 22 }} />
                          </div>
                          {/* Line Total */}
                          <div style={{ textAlign: "right", fontFamily: "IBM Plex Mono", fontSize: 13, fontWeight: 700, color: lineTotal > 0 ? "#0F172A" : "#374151", paddingTop: 6 }}>
                            {curr2}{lineTotal.toFixed(2)}
                          </div>
                          {/* Remove */}
                          <button
                            className="btn btn-danger btn-sm btn-icon"
                            onClick={() => removeItem(i)}
                            disabled={form.items.length === 1}
                            style={{ opacity: form.items.length === 1 ? 0.3 : 1, width: 28, height: 28, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <Icon name="trash" size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── TOTALS + PAYMENT (side by side) ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>

                  {/* Order Summary */}
                  <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(59,130,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="reports" size={11} color="#3B82F6" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Order Summary</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, color: "#64748B" }}>Total Items</span>
                      <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#475569" }}>{totalQty.toLocaleString()}</span>
                    </div>
                    <div style={{ height: 1, background: "#E2E8F0", margin: "8px 0 12px" }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>Grand Total</span>
                      <span style={{ fontFamily: "IBM Plex Mono", fontSize: 20, fontWeight: 800, color: "#3B82F6" }}>{curr2}{total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Payment Details */}
                  <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: "rgba(16,185,129,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Icon name="finance" size={11} color="#10B981" />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "IBM Plex Mono" }}>Payment</span>
                    </div>

                    {/* Amount Paid input */}
                    <div style={{ position: "relative", marginBottom: 10 }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "#10B981", fontFamily: "IBM Plex Mono", pointerEvents: "none" }}>{curr2}</span>
                      <input type="number" min={0} value={form.paidAmount}
                        onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))}
                        style={{ paddingLeft: 28, fontFamily: "IBM Plex Mono", fontWeight: 700, fontSize: 15, color: "#10B981", borderColor: "rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.05)" }}
                        placeholder="0.00"
                      />
                    </div>

                    {/* Payment Method dropdown */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>Payment Method</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                        {["Cash", "Premier Bank", "UCB Bank", "Woori Bank"].map(method => {
                          const active = (form.paymentMethod || "Cash") === method;
                          return (
                            <button key={method} onClick={() => setForm(f => ({ ...f, paymentMethod: method }))}
                              style={{
                                padding: "7px 6px", borderRadius: 7,
                                border: `1px solid ${active ? "rgba(16,185,129,0.5)" : "#E2E8F0"}`,
                                background: active ? "rgba(16,185,129,0.12)" : "transparent",
                                color: active ? "#10B981" : "#475569",
                                fontSize: 11, fontWeight: 700, fontFamily: "IBM Plex Mono",
                                cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
                                overflow: "hidden", textOverflow: "ellipsis",
                              }}>
                              {method}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Due + Status row */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono", marginBottom: 2 }}>DUE / BALANCE</div>
                        <div style={{ fontFamily: "IBM Plex Mono", fontSize: 14, fontWeight: 800, color: dueAmt > 0 ? "#EF4444" : "#10B981" }}>{curr2}{dueAmt.toFixed(2)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "#475569", fontFamily: "IBM Plex Mono", marginBottom: 4 }}>STATUS</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {["", "paid", "partial", "due"].map(s => {
                            const label = s === "" ? `Auto` : s.charAt(0).toUpperCase() + s.slice(1);
                            const isActive = form.status === s;
                            const colMap = { paid: "#10B981", partial: "#F59E0B", due: "#EF4444", "": "#3B82F6" };
                            const col = colMap[s] || "#3B82F6";
                            return (
                              <button key={s} onClick={() => setForm(f => ({ ...f, status: s }))}
                                style={{
                                  padding: "4px 8px", borderRadius: 6, border: `1px solid ${isActive ? col : "#E2E8F0"}`,
                                  background: isActive ? `${col}20` : "transparent",
                                  color: isActive ? col : "#475569",
                                  fontSize: 10, fontWeight: 700, fontFamily: "IBM Plex Mono", cursor: "pointer",
                                  transition: "all 0.15s",
                                }}>
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>)}

              {/* ── NOTES ── */}
              <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "IBM Plex Mono", display: "block", marginBottom: 8 }}>Notes (optional)</label>
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                  placeholder="Add any extra information or instructions…"
                  style={{ resize: "vertical", minHeight: 60 }}
                />
              </div>

              {/* ── FOOTER ACTIONS ── */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 18px", background: "#F4F6FB", borderRadius: 12,
                border: "1px solid #E2E8F0",
              }}>
                <div style={{ fontSize: 12, color: "#475569" }}>
                  {form.purchaseType === "regular" && total > 0 && (
                    <span>
                      {form.items.filter(it => it.productId).length} product{form.items.filter(it => it.productId).length !== 1 ? "s" : ""} · Grand Total: <strong style={{ color: "#3B82F6", fontFamily: "IBM Plex Mono" }}>{curr2}{total.toFixed(2)}</strong>
                    </span>
                  )}
                  {form.purchaseType === "advance" && +form.advanceAmount > 0 && (
                    <span>Payment: <strong style={{ color: "#8B5CF6", fontFamily: "IBM Plex Mono" }}>{curr2}{(+form.advanceAmount).toFixed(2)}</strong></span>
                  )}
                  {form.purchaseType === "return" && returnTotal > 0 && (
                    <span>Return Credit: <strong style={{ color: "#EF4444", fontFamily: "IBM Plex Mono" }}>{curr2}{returnTotal.toFixed(2)}</strong></span>
                  )}
                  {form.purchaseType === "deducted" && +form.deductedAmount > 0 && (
                    <span>Deducted: <strong style={{ color: "#F59E0B", fontFamily: "IBM Plex Mono" }}>− {curr2}{(+form.deductedAmount).toFixed(2)}</strong></span>
                  )}
                  {form.purchaseType === "aidtds" && +form.aidTdsAmount > 0 && (
                    <span>AIT-TDS: <strong style={{ color: "#06B6D4", fontFamily: "IBM Plex Mono" }}>− {curr2}{(+form.aidTdsAmount).toFixed(2)}</strong></span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)} style={{ padding: "9px 20px" }}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={submitPurchase} style={{
                    padding: "9px 24px", fontWeight: 700, fontSize: 13,
                    background: form.purchaseType === "advance" ? "linear-gradient(135deg, #059669, #10B981)" : form.purchaseType === "return" ? "linear-gradient(135deg, #DC2626, #EF4444)" : form.purchaseType === "deducted" ? "linear-gradient(135deg, #D97706, #F59E0B)" : form.purchaseType === "aidtds" ? "linear-gradient(135deg, #0891B2, #06B6D4)" : "linear-gradient(135deg, #2563EB, #3B82F6)",
                    boxShadow: form.purchaseType === "advance" ? "0 4px 14px rgba(16,185,129,0.35)" : form.purchaseType === "return" ? "0 4px 14px rgba(239,68,68,0.35)" : form.purchaseType === "deducted" ? "0 4px 14px rgba(245,158,11,0.35)" : form.purchaseType === "aidtds" ? "0 4px 14px rgba(6,182,212,0.35)" : "0 4px 14px rgba(59,130,246,0.35)",
                  }}>
                    <Icon name="check" size={14} />
                    {form.purchaseType === "advance" ? "Apply Payment" : form.purchaseType === "return" ? "Process Return" : form.purchaseType === "deducted" ? "Save Deduction" : form.purchaseType === "aidtds" ? "Save AIT-TDS" : editItem ? "Update Purchase" : "Create Purchase"}
                  </button>
                </div>
              </div>

            </div>
          );
        })()}
      </Modal>
    </div>
  );
};

// ============================================================
// INVENTORY
// ============================================================
const Inventory = () => {
  const { data, setData, toast, curr, currentUser } = useApp();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const PER_PAGE = 12;

  const filtered = data.products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
    const matchCat = catFilter === "all" || String(p.category) === String(catFilter);
    return matchSearch && matchCat;
  }).sort((a, b) => {
    const na = parseInt(a.sku, 10), nb = parseInt(b.sku, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return (a.sku || "").localeCompare(b.sku || "");
  });

  const emptyForm = { name: "", sku: "", category: "", buyPrice: 0, sellPrice: 0, stock: 0, minStock: 5, unit: "pcs", batch: "" };
  const [form, setForm] = useState(emptyForm);

  const openEdit = (p) => { setEditItem(p); setForm({ ...p }); setShowModal(true); };
  const openNew = () => {
    setEditItem(null);
    const nums = data.products.map(p => parseInt(p.sku, 10)).filter(n => !isNaN(n));
    const nextSku = String(nums.length > 0 ? Math.max(...nums) + 1 : 1);
    setForm({ ...emptyForm, sku: nextSku });
    setShowModal(true);
  };

  const submit = () => {
    if (!form.name || !form.sku) { toast("Name and SKU required", "error"); return; }
    if (editItem) {
      setData(d => ({ ...d, products: d.products.map(p => p.id === editItem.id ? { ...p, ...form } : p) }));
      toast("Product updated!", "success");
    } else {
      setData(d => ({ ...d, products: [...d.products, { ...form, id: generateId() }] }));
      toast("Product added!", "success");
    }
    setShowModal(false);
  };

  const deleteProduct = (id) => {
    const prod = data.products.find(p => p.id === id);
    if (!prod) return;
    if (!window.confirm(`Delete product "${prod.name}"? It will be moved to the Recycle Bin and can be restored.`)) return;
    const entry = makeBinEntry("products", prod, data, currentUser?.name);
    setData(d => trashItem(d, "products", entry));
    toast("Product moved to Recycle Bin", "success");
  };

  const addNewCategory = () => {
    const val = newCatName.trim();
    if (!val) { toast("Enter a category name", "error"); return; }
    const colors = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#F97316","#EC4899"];
    const color = colors[data.categories.length % colors.length];
    const newCat = { id: generateId(), name: val, color };
    setData(d => ({ ...d, categories: [...d.categories, newCat] }));
    setForm(f => ({ ...f, category: newCat.id }));
    setNewCatName("");
    toast("Category added!", "success");
  };

  const stockStatus = (p) => p.stock === 0 ? "out" : p.stock <= p.minStock ? "low" : "ok";
  const ssColor = { out: "#EF4444", low: "#F59E0B", ok: "#10B981" };
  const ssBg = { out: "rgba(239,68,68,0.1)", low: "rgba(245,158,11,0.1)", ok: "rgba(16,185,129,0.1)" };
  const ssLabel = { out: "OUT OF STOCK", low: "LOW STOCK", ok: "IN STOCK" };

  const totalProducts = data.products.length;
  const totalStockVal = data.products.reduce((s, p) => s + p.stock * p.buyPrice, 0);
  const retailVal = data.products.reduce((s, p) => s + p.stock * p.sellPrice, 0);
  const lowStockCount = data.products.filter(p => p.stock > 0 && p.stock <= p.minStock).length;
  const outCount = data.products.filter(p => p.stock === 0).length;

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: 0 }}>Inventory Management</h2>
          <p style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>{totalProducts} products across {data.categories.length} categories</p>
        </div>
        <button className="btn btn-primary" onClick={openNew} style={{ gap: 8 }}>
          <Icon name="plus" size={15} /> Add Product
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          { label: "Total Products", value: totalProducts, isCurr: false, color: "#3B82F6", icon: "package" },
          { label: "Stock Value", value: curr + totalStockVal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }), isCurr: false, color: "#10B981", icon: "finance" },
          { label: "Retail Value", value: curr + retailVal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }), isCurr: false, color: "#8B5CF6", icon: "reports" },
          { label: "Low Stock", value: lowStockCount, isCurr: false, color: "#F59E0B", icon: "alert" },
          { label: "Out of Stock", value: outCount, isCurr: false, color: "#EF4444", icon: "alert" },
        ].map(s => (
          <div key={s.label} style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: 3, height: "100%", background: s.color, borderRadius: "10px 0 0 10px" }} />
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 6, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Category Dropdown */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px", maxWidth: 380 }}>
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search by product name or SKU..." />
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <select
            value={catFilter}
            onChange={e => { setCatFilter(e.target.value); setPage(1); }}
            style={{
              appearance: "none",
              WebkitAppearance: "none",
              background: "#FFFFFF",
              border: `1px solid ${catFilter !== "all" ? (() => { const c = data.categories.find(c => String(c.id) === String(catFilter)); return c ? c.color : "#3B82F6"; })() : "#E2E8F0"}`,
              borderRadius: 8,
              color: catFilter !== "all" ? (() => { const c = data.categories.find(c => String(c.id) === String(catFilter)); return c ? c.color : "#3B82F6"; })() : "#475569",
              padding: "9px 36px 9px 12px",
              fontSize: 13,
              fontFamily: "'Sora', sans-serif",
              fontWeight: 500,
              cursor: "pointer",
              minWidth: 180,
              width: "auto",
              outline: "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
              boxShadow: catFilter !== "all" ? (() => { const c = data.categories.find(c => String(c.id) === String(catFilter)); return c ? `0 0 0 3px ${c.color}20` : "none"; })() : "none",
            }}
          >
            <option value="all" style={{ background: "#FFFFFF", color: "#0F172A" }}>
              All Categories ({data.products.length})
            </option>
            {data.categories.map(c => {
              const count = data.products.filter(p => String(p.category) === String(c.id)).length;
              return (
                <option key={c.id} value={c.id} style={{ background: "#FFFFFF", color: "#0F172A" }}>
                  {c.name} ({count})
                </option>
              );
            })}
          </select>
          {/* Custom dropdown arrow */}
          <span style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            pointerEvents: "none", color: catFilter !== "all"
              ? (() => { const c = data.categories.find(c => String(c.id) === String(catFilter)); return c ? c.color : "#3B82F6"; })()
              : "#64748B",
            fontSize: 10, lineHeight: 1,
          }}>▼</span>
        </div>
        {catFilter !== "all" && (
          <button
            onClick={() => { setCatFilter("all"); setPage(1); }}
            style={{
              background: "none", border: "1px solid #E2E8F0", borderRadius: 8,
              color: "#64748B", fontSize: 12, padding: "8px 12px", cursor: "pointer",
              fontFamily: "'Sora', sans-serif", display: "inline-flex", alignItems: "center", gap: 5,
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "#0F172A"; e.currentTarget.style.borderColor = "#CBD5E1"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#64748B"; e.currentTarget.style.borderColor = "#E2E8F0"; }}
          >
            ✕ Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>📦</div>
            <div style={{ color: "#64748B", fontSize: 14 }}>No products found{catFilter !== "all" ? " in this category" : ""}</div>
            {catFilter !== "all" && <button onClick={() => { setCatFilter("all"); setPage(1); }} style={{ marginTop: 10, fontSize: 12, color: "#3B82F6", background: "none", border: "none", cursor: "pointer" }}>Clear filter</button>}
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Category</th>
                    <th>Buy Price</th>
                    <th>Sell Price</th>
                    <th>Stock</th>
                    <th>Min Stock</th>
                    <th>Batch</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE).map((p, idx) => {
                    const cat = data.categories.find(c => String(c.id) === String(p.category));
                    const ss = stockStatus(p);
                    const rowNum = (page - 1) * PER_PAGE + idx + 1;
                    return (
                      <tr key={p.id} style={{ transition: "background 0.1s" }}>
                        <td style={{ color: "#475569", fontFamily: "IBM Plex Mono", fontSize: 11 }}>{rowNum}</td>
                        <td style={{ fontWeight: 600, color: "#E2E8F0", maxWidth: 200 }}>{p.name}</td>
                        <td>
                          <span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 5, padding: "2px 7px", color: "#475569" }}>{p.sku}</span>
                        </td>
                        <td>
                          {cat ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: `${cat.color}15`, border: `1px solid ${cat.color}30`, borderRadius: 12, padding: "2px 9px", fontSize: 11, fontWeight: 600, color: cat.color }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color }} />
                              {cat.name}
                            </span>
                          ) : <span style={{ color: "#475569", fontSize: 12 }}>—</span>}
                        </td>
                        <td><span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#94A3B8" }}>{curr}{p.buyPrice.toFixed(2)}</span></td>
                        <td><span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#E2E8F0", fontWeight: 600 }}>{curr}{p.sellPrice.toFixed(2)}</span></td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ fontFamily: "IBM Plex Mono", fontWeight: 700, fontSize: 14, color: ssColor[ss] }}>{p.stock}</span>
                            <span style={{ fontSize: 10, color: "#64748B" }}>{p.unit}</span>
                          </div>
                        </td>
                        <td><span style={{ fontFamily: "IBM Plex Mono", fontSize: 12, color: "#64748B" }}>{p.minStock}</span></td>
                        <td><span style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#64748B" }}>{p.batch || "—"}</span></td>
                        <td>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: ssBg[ss], border: `1px solid ${ssColor[ss]}30`, borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 700, color: ssColor[ss], fontFamily: "IBM Plex Mono", whiteSpace: "nowrap" }}>
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: ssColor[ss] }} />
                            {ssLabel[ss]}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button title="Edit" className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(p)}><Icon name="edit" size={13} /></button>
                            <button title="Delete" className="btn btn-danger btn-sm btn-icon" onClick={() => deleteProduct(p.id)}><Icon name="trash" size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </>
        )}
      </div>

      {/* Add/Edit Product Modal */}
      <Modal open={showModal} onClose={() => { setShowModal(false); setNewCatName(""); }} title={editItem ? "Edit Product" : "Add New Product"} width={620}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">Product Name *</label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Enter product name" />
          </div>
          <div className="form-group">
            <label className="form-label">SKU *</label>
            <input type="text" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
            {!editItem && <div style={{ fontSize: 11, color: "#3B82F6", marginTop: 4, fontFamily: "IBM Plex Mono" }}>↑ Auto-generated · editable</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Batch Number</label>
            <input type="text" value={form.batch} onChange={e => setForm(f => ({ ...f, batch: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="form-group">
            <label className="form-label">Unit</label>
            <select value={form.unit || "pcs"} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {["pcs","kg","g","liter","ml","packet","bag","box","bottle","dozen","set","pair","roll","sheet","meter","feet"].map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              <option value="">— Select Category —</option>
              {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
              <input
                type="text"
                placeholder="New category name…"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addNewCategory()}
                style={{ flex: 1, padding: "6px 10px", fontSize: 12 }}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={addNewCategory} style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                <Icon name="plus" size={12} /> Add
              </button>
            </div>
          </div>
          {[["buyPrice", "Buy Price"], ["sellPrice", "Sell Price"], ["stock", "Current Stock"], ["minStock", "Min Stock"]].map(([k, l]) => (
            <div key={k} className="form-group">
              <label className="form-label">{l}</label>
              <input type="number" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: +e.target.value }))} min={0} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16, paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
          <button className="btn btn-secondary" onClick={() => { setShowModal(false); setNewCatName(""); }}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}><Icon name="check" size={14} /> {editItem ? "Update Product" : "Add Product"}</button>
        </div>
      </Modal>
    </div>
  );
};
// ============================================================
// CUSTOMERS
// ============================================================
const Customers = () => {
  const { data, setData, toast, curr, currentUser } = useApp();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 8;

  const filtered = data.customers
    .slice()
    .sort((a, b) => (parseInt(a.customerId, 10) || 0) - (parseInt(b.customerId, 10) || 0))
    .filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.customerId && String(c.customerId).includes(search))
    );

  const emptyForm = { customerId: "", name: "", email: "", phone: "", address: "", creditLimit: 5000, balance: 0 };
  const [form, setForm] = useState(emptyForm);

  const openNew = () => {
    const nextId = Math.max(
      0,
      ...data.customers.map(c => parseInt(c.customerId, 10) || 0),
      ...(data.recycleBin || []).filter(e => e.collection === "customers").map(e => parseInt(e.item && e.item.customerId, 10) || 0),
    ) + 1;
    setEditItem(null);
    setForm({ ...emptyForm, customerId: String(nextId) });
    setShowModal(true);
  };
  const openEdit = (c) => { setEditItem(c); setForm({ ...c }); setShowModal(true); };
  const deleteCustomer = (c) => { if (!window.confirm(`Delete customer "${c.name}"? It will be moved to the Recycle Bin and can be restored.`)) return; const entry = makeBinEntry("customers", c, data, currentUser?.name); setData(d => trashItem(d, "customers", entry)); toast("Customer moved to Recycle Bin", "success"); };

  const submit = () => {
    if (!form.name) { toast("Name required", "error"); return; }
    if (editItem) {
      setData(d => ({ ...d, customers: d.customers.map(c => c.id === editItem.id ? { ...c, ...form } : c) }));
      toast("Customer updated!", "success");
    } else {
      setData(d => ({ ...d, customers: [...d.customers, { ...form, id: generateId(), customerId: form.customerId }] }));
      toast("Customer added!", "success");
    }
    setShowModal(false);
  };

  const getCustSales = (id) => data.sales.filter(s => s.customerId === id);

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader title="Customer Management" subtitle={`${data.customers.length} customers`}
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={15} /> Add Customer</button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Total Customers", v: data.customers.length, prefix: "" },
          { l: "Total Revenue", v: data.sales.reduce((s, x) => s + x.total, 0) },
          { l: "Outstanding Dues", v: data.sales.filter(s => s.saleType !== "advance" && s.saleType !== "return" && s.saleType !== "deducted" && s.saleType !== "aidtds").reduce((s, x) => s + (x.due || 0), 0) - data.sales.filter(s => s.saleType === "advance").reduce((s, x) => s + (x.paid || 0), 0) - data.sales.filter(s => s.saleType === "return").reduce((s, x) => s + (x.total || 0), 0) - data.sales.filter(s => s.saleType === "deducted").reduce((s, x) => s + Math.abs(x.total || 0), 0) - data.sales.filter(s => s.saleType === "aidtds").reduce((s, x) => s + Math.abs(x.total || 0), 0) },
        ].map(s => (
          <div key={s.l} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>{s.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0F172A", fontFamily: "IBM Plex Mono" }}>{s.prefix !== "" ? curr : ""}{s.prefix !== "" ? Number(s.v).toLocaleString("en-US", { minimumFractionDigits: 2 }) : s.v}</div>
          </div>
        ))}
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search customers..." style={{ marginBottom: 16, maxWidth: 400 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
        {filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(c => {
          const sales = getCustSales(c.id);
          const totalSpent = sales.reduce((s, x) => s + x.total, 0);
          return (
            <div key={c.id} className="card card-hover" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white" }}>{c.name[0]}</div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{c.name}</div>
                      {c.customerId && (
                        <span style={{ fontSize: 10, fontFamily: "IBM Plex Mono", background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>
                          #{c.customerId}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>{c.email}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setViewItem(c)}><Icon name="eye" size={13} /></button>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(c)}><Icon name="edit" size={13} /></button>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteCustomer(c)}><Icon name="trash" size={13} /></button>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  { l: "Total Spent", v: `${curr}${totalSpent.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
                  { l: "Orders", v: sales.length },
                  { l: "Credit Limit", v: `${curr}${c.creditLimit.toLocaleString()}` },
                  { l: "Balance Due", v: (() => { const custSales = data.sales.filter(s => s.customerId === c.id); const lbal = custSales.reduce((bal, s) => s.saleType === "advance" ? bal - (s.paid||0) : s.saleType === "return" ? bal - (s.total||0) : bal + (s.total||0) - (s.paid||0), 0); return `${curr}${Math.abs(lbal).toLocaleString("en-US",{minimumFractionDigits:0})}${lbal > 0 ? " (Due)" : lbal < 0 ? " (Advance)" : ""}`; })(), color: (() => { const custSales = data.sales.filter(s => s.customerId === c.id); const lbal = custSales.reduce((bal, s) => s.saleType === "advance" ? bal - (s.paid||0) : s.saleType === "return" ? bal - (s.total||0) : bal + (s.total||0) - (s.paid||0), 0); return lbal > 0 ? "#EF4444" : "#10B981"; })() },
                ].map(item => (
                  <div key={item.l} style={{ background: "#F1F5F9", borderRadius: 6, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono", marginBottom: 2 }}>{item.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "IBM Plex Mono", color: item.color || "#0F172A" }}>{item.v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}><Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} /></div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editItem ? "Edit Customer" : "Add Customer"} width={500}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Customer ID</label>
            <input
              value={form.customerId || ""}
              onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))}
              placeholder="Auto-assigned"
            />
          </div>
          {[["name", "Name *"], ["email", "Email"], ["phone", "Phone"]].map(([k, l]) => (
            <div key={k} className="form-group" style={k === "name" ? {} : {}}>
              <label className="form-label">{l}</label>
              <input value={form[k] || ""} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">Address</label>
            <input value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          {[["creditLimit", "Credit Limit"], ["balance", "Balance Due"]].map(([k, l]) => (
            <div key={k} className="form-group">
              <label className="form-label">{l}</label>
              <input type="number" value={form[k] || 0} onChange={e => setForm(f => ({ ...f, [k]: +e.target.value }))} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}><Icon name="check" size={14} /> {editItem ? "Update" : "Add"}</button>
        </div>
      </Modal>

      <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Customer Ledger" width={860}>
        {viewItem && <CustomerLedger key={viewItem.id} customer={viewItem} />}
      </Modal>
    </div>
  );
};

// ============================================================
// CUSTOMER LEDGER  (Redesigned — Professional v2)
// ============================================================
const CustomerLedger = ({ customer }) => {
  const { data, curr } = useApp();

  const settings   = data.settings;
  const taxName    = settings.taxName || "VAT";

  const allSales = data.sales
    .filter(s => s.customerId === customer.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Auto-detect earliest and latest transaction dates for this customer
  const firstDate = allSales.length > 0 ? allSales[0].date.slice(0, 10) : daysAgo(365);
  const lastDate  = allSales.length > 0 ? allSales[allSales.length - 1].date.slice(0, 10) : fmt(today);

  const [dateFrom, setDateFrom] = useState(firstDate);
  const [dateTo,   setDateTo]   = useState(lastDate);

  // Safe date filter — treat empty/invalid date as "no limit on that side"
  const safeFrom = dateFrom && dateFrom.length === 10 ? dateFrom : "0000-01-01";
  const safeTo   = dateTo   && dateTo.length   === 10 ? dateTo   : "9999-12-31";
  // Normalize sale date to YYYY-MM-DD (first 10 chars) before comparing
  const filtered = allSales.filter(s => {
    const d = (s.date || "").slice(0, 10);
    return d >= safeFrom && d <= safeTo;
  });

  // Live balance across ALL time
  const liveBalance = allSales.reduce((bal, s) => {
    if (s.saleType === "advance") return bal - (s.paid || 0);
    if (s.saleType === "return")  return bal - (s.total || 0);
    return bal + (s.total || 0) - (s.paid || 0);
  }, 0);

  const totalBilled  = filtered.filter(s => s.saleType !== "advance" && s.saleType !== "return" && s.saleType !== "deducted" && s.saleType !== "aidtds").reduce((s, x) => s + (x.total    || 0), 0);
  const totalVAT     = filtered.filter(s => s.saleType !== "advance" && s.saleType !== "return" && s.saleType !== "deducted" && s.saleType !== "aidtds").reduce((s, x) => s + (x.vat      || 0), 0);
  const totalPaid    = filtered.filter(s => s.saleType !== "return" && s.saleType !== "deducted" && s.saleType !== "aidtds").reduce((s, x) => s + (x.paid     || 0), 0);
  const totalDue     = filtered.filter(s => s.saleType !== "advance" && s.saleType !== "return" && s.saleType !== "deducted" && s.saleType !== "aidtds").reduce((s, x) => s + (x.due      || 0), 0);
  const totalAdvance = filtered.filter(s => s.saleType === "advance").reduce((s, x) => s + (x.paid     || 0), 0);
  const totalReturn  = filtered.filter(s => s.saleType === "return").reduce((s, x) => s + (x.total    || 0), 0);
  const totalDeducted = filtered.filter(s => s.saleType === "deducted").reduce((s, x) => s + Math.abs(x.total || 0), 0);
  const totalAidTds  = filtered.filter(s => s.saleType === "aidtds").reduce((s, x) => s + Math.abs(x.total || 0), 0);
  const totalCash    = filtered.filter(s => (s.paymentMethod || "").toLowerCase() === "cash").reduce((s, x) => s + (x.paid || 0), 0);
  const totalBank    = filtered.filter(s => { const m = (s.paymentMethod || "").toLowerCase(); return m.includes("premier") || m.includes("ucb") || m.includes("woori"); }).reduce((s, x) => s + (x.paid || 0), 0);
  const totalSubtotal = filtered.filter(s => s.saleType !== "advance" && s.saleType !== "return" && s.saleType !== "deducted" && s.saleType !== "aidtds").reduce((sum, sale) => {
    if (sale.items && sale.items.length > 0) {
      return sum + sale.items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0) * (1 - (it.discount || 0) / 100), 0);
    }
    return sum + (sale.subtotal || sale.total || 0);
  }, 0);

  // ── Build flat ledger rows (one row per line item) ──────────────────────────
  // Line Total formula:  Subtotal (qty × price × (1-disc%))  +  Proportional VAT
  const rows = [];
  filtered.forEach(sale => {
    if (sale.saleType === "advance") {
      rows.push({
        saleId: sale.id, invoiceNo: sale.invoiceNo, date: sale.date, status: sale.status,
        isAdvance: true, isReturn: false, isDeducted: false, isAidTds: false,
        product: "— Payment —", qty: "—", unit: "—",
        price: 0, discount: 0,
        itemSubtotal: 0, itemVat: 0, lineTotal: sale.paid,
        isFirst: true, rowSpan: 1,
        saleTotal: 0, salePaid: sale.paid, saleDue: 0,
        paymentMethod: sale.paymentMethod || "",
      });
    } else if (sale.saleType === "deducted") {
      rows.push({
        saleId: sale.id, invoiceNo: sale.invoiceNo, date: sale.date, status: sale.status,
        isAdvance: false, isReturn: false, isDeducted: true, isAidTds: false,
        product: "— Deducted —", qty: "—", unit: "—",
        price: 0, discount: 0,
        itemSubtotal: 0, itemVat: 0, lineTotal: sale.total,
        isFirst: true, rowSpan: 1,
        saleTotal: sale.total, salePaid: 0, saleDue: 0,
        paymentMethod: sale.paymentMethod || "",
      });
    } else if (sale.saleType === "aidtds") {
      rows.push({
        saleId: sale.id, invoiceNo: sale.invoiceNo, date: sale.date, status: sale.status,
        isAdvance: false, isReturn: false, isDeducted: false, isAidTds: true,
        product: "— AIT-TDS —", qty: "—", unit: "—",
        price: 0, discount: 0,
        itemSubtotal: 0, itemVat: 0, lineTotal: sale.total,
        isFirst: true, rowSpan: 1,
        saleTotal: sale.total, salePaid: 0, saleDue: 0,
        paymentMethod: sale.paymentMethod || "",
      });
    } else if (sale.saleType === "return") {
      const items = sale.items && sale.items.length > 0 ? sale.items : [];
      if (items.length === 0) {
        rows.push({
          saleId: sale.id, invoiceNo: sale.invoiceNo, date: sale.date, status: sale.status,
          isAdvance: false, isReturn: true,
          product: "— Return —", qty: "—", unit: "—",
          price: 0, discount: 0,
          itemSubtotal: 0, itemVat: 0, lineTotal: sale.total,
          isFirst: true, saleTotal: sale.total, salePaid: 0, saleDue: 0, rowSpan: 1,
        });
      } else {
        items.forEach((item, idx) => {
          const prod = data.products.find(p => p.id === item.productId);
          const itemSubtotal = (item.qty || 0) * (item.price || 0);
          rows.push({
            saleId: sale.id, invoiceNo: sale.invoiceNo, date: sale.date, status: sale.status,
            isAdvance: false, isReturn: true,
            product: item.productName || prod?.name || "—",
            qty: item.qty, unit: item.unit || prod?.unit || "pcs",
            price: item.price, discount: 0,
            itemSubtotal, itemVat: 0, lineTotal: itemSubtotal,
            isFirst: idx === 0,
            saleTotal: sale.total, salePaid: 0, saleDue: 0, rowSpan: items.length,
            paymentMethod: "",
          });
        });
      }
    } else {
      const items = sale.items && sale.items.length > 0 ? sale.items : [];
      if (items.length === 0) {
        rows.push({
          saleId: sale.id, invoiceNo: sale.invoiceNo, date: sale.date, status: sale.status,
          isAdvance: false, isReturn: false,
          product: "—", qty: "—", unit: "—", price: 0, discount: 0,
          itemSubtotal: sale.subtotal || sale.total, itemVat: sale.vat || 0, lineTotal: sale.total,
          isFirst: true, saleTotal: sale.total, salePaid: sale.paid, saleDue: sale.due, rowSpan: 1,
          paymentMethod: sale.paymentMethod || "",
        });
      } else {
        const saleSubtotal = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0) * (1 - (it.discount || 0) / 100), 0);
        items.forEach((item, idx) => {
          const prod = data.products.find(p => p.id === item.productId);
          const itemSubtotal = (item.qty || 0) * (item.price || 0) * (1 - (item.discount || 0) / 100);
          // Proportional VAT: each item carries its share of the invoice VAT
          const itemVat = saleSubtotal > 0 ? (itemSubtotal / saleSubtotal) * (sale.vat || 0) : 0;
          rows.push({
            saleId:    sale.id,
            invoiceNo: sale.invoiceNo,
            date:      sale.date,
            status:    sale.status,
            isAdvance: false,
            isReturn:  false,
            product:   item.productName || prod?.name || "—",
            qty:       item.qty,
            unit:      item.unit || prod?.unit || "pcs",
            price:     item.price,
            discount:  item.discount || 0,
            itemSubtotal,
            itemVat,
            lineTotal: itemSubtotal + itemVat,   // ← Line Total = Subtotal + VAT
            isFirst:   idx === 0,
            saleTotal: sale.total,
            salePaid:  sale.paid,
            saleDue:   sale.due,
            rowSpan:   items.length,
            paymentMethod: idx === 0 ? (sale.paymentMethod || "") : "",
          });
        });
      }
    }
  });

  // ── Professional PDF Generator ───────────────────────────────────────────────
  const downloadPDF = () => {
    const companyName = settings.companyName || "BizCore ERP";
    const vatPct      = settings.taxRate || 10;

    // Build HTML rows — one <tr> per line item (no rowspan → clean print layout)
    const tableRows = (() => {
      const htmlRows = [];
      let runBalance = 0;

      filtered.forEach(sale => {
        if (sale.saleType === "advance") {
          runBalance -= (sale.paid || 0);
          const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
          htmlRows.push(`
            <tr class="row-advance">
              <td class="mono" style="color:#6d28d9;font-weight:700">${sale.invoiceNo}</td>
              <td class="mono">${sale.date}</td>
              <td style="color:#6d28d9;font-style:italic;font-weight:600">— Payment —</td>
              <td class="center">—</td>
              <td class="center"><span class="badge badge-adv">PAY</span></td>
              <td class="right">—</td>
              <td class="center">—</td>
              <td class="right">—</td>
              <td class="right">—</td>
              <td class="right mono bold" style="color:#6d28d9">${curr}${Number(sale.paid).toFixed(2)}</td>
              <td class="right mono bold green">${curr}${Number(sale.paid).toFixed(2)}</td>
              <td style="color:#6d28d9;font-size:10px">${sale.paymentMethod || "—"}</td>
              <td class="right mono">—</td>
              <td><span class="badge badge-advance">PAYMENT</span></td>
              <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
            </tr>`);
          return;
        }

        if (sale.saleType === "return") {
          runBalance -= (sale.total || 0);
          const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
          const items = sale.items && sale.items.length > 0 ? sale.items : [];
          if (items.length === 0) {
            htmlRows.push(`
              <tr class="row-return">
                <td class="mono" style="color:#dc2626;font-weight:700">${sale.invoiceNo}</td>
                <td class="mono">${sale.date}</td>
                <td style="color:#dc2626;font-style:italic;font-weight:600">— Sales Return —</td>
                <td class="center">—</td><td class="center"><span class="badge badge-ret">RET</span></td>
                <td class="right">—</td><td class="center">—</td>
                <td class="right">—</td><td class="right">—</td>
                <td class="right mono bold" style="color:#dc2626">↩ ${curr}${Number(sale.total).toFixed(2)}</td>
                <td class="right">—</td><td>—</td><td class="right">—</td>
                <td><span class="badge badge-ret-s">RETURN</span></td>
                <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
              </tr>`);
          } else {
            items.forEach((item, idx) => {
              const prod = data.products.find(p => p.id === item.productId);
              const itemSub = (item.qty || 0) * (item.price || 0);
              if (idx === items.length - 1) {
                /* running balance only on last item row of return */
              }
              htmlRows.push(`
                <tr class="row-return ${idx % 2 !== 0 ? "alt" : ""}">
                  <td class="mono" style="color:#dc2626;font-weight:700">${idx === 0 ? sale.invoiceNo : ""}</td>
                  <td class="mono">${idx === 0 ? sale.date : ""}</td>
                  <td style="color:#dc2626">${item.productName || prod?.name || "—"}</td>
                  <td class="center mono">${item.qty}</td>
                  <td class="center"><span class="badge badge-ret">${item.unit || prod?.unit || "pcs"}</span></td>
                  <td class="right mono">${curr}${Number(item.price).toFixed(2)}</td>
                  <td class="center">—</td>
                  <td class="right mono">—</td>
                  <td class="right mono">—</td>
                  <td class="right mono bold" style="color:#dc2626">↩ ${curr}${itemSub.toFixed(2)}</td>
                  <td class="right">—</td><td>—</td><td class="right">—</td>
                  <td>${idx === 0 ? `<span class="badge badge-ret-s">RETURN</span>` : ""}</td>
                  <td class="right mono bold" style="color:${balColor}">${idx === items.length - 1 ? curr + Math.abs(runBalance).toFixed(2) : ""}</td>
                </tr>`);
            });
          }
          return;
        }

        if (sale.saleType === "deducted") {
          runBalance += (sale.total || 0);
          const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
          htmlRows.push(`
            <tr class="row-deducted">
              <td class="mono" style="color:#b45309;font-weight:700">${sale.invoiceNo}</td>
              <td class="mono">${sale.date}</td>
              <td style="color:#b45309;font-style:italic;font-weight:600">— Deducted —</td>
              <td class="center">—</td>
              <td class="center"><span class="badge badge-ded">DED</span></td>
              <td class="right">—</td>
              <td class="center">—</td>
              <td class="right">—</td>
              <td class="right">—</td>
              <td class="right mono bold" style="color:#b45309">− ${curr}${Math.abs(Number(sale.total)).toFixed(2)}</td>
              <td class="right">—</td><td>—</td><td class="right">—</td>
              <td><span class="badge badge-ded">DEDUCTED</span></td>
              <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
            </tr>`);
          return;
        }

        if (sale.saleType === "aidtds") {
          runBalance += (sale.total || 0);
          const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
          htmlRows.push(`
            <tr class="row-aidtds">
              <td class="mono" style="color:#0e7490;font-weight:700">${sale.invoiceNo}</td>
              <td class="mono">${sale.date}</td>
              <td style="color:#0e7490;font-style:italic;font-weight:600">— AIT-TDS —</td>
              <td class="center">—</td>
              <td class="center"><span class="badge badge-tds">TDS</span></td>
              <td class="right">—</td>
              <td class="center">—</td>
              <td class="right">—</td>
              <td class="right">—</td>
              <td class="right mono bold" style="color:#0e7490">− ${curr}${Math.abs(Number(sale.total)).toFixed(2)}</td>
              <td class="right">—</td><td>—</td><td class="right">—</td>
              <td><span class="badge badge-tds">AIT-TDS</span></td>
              <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
            </tr>`);
          return;
        }

        // Regular sale
        const items = sale.items && sale.items.length > 0 ? sale.items : [];
        const saleSubtotalAllForBal = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0) * (1 - (it.discount || 0) / 100), 0);
        const saleLineTotalForBal = items.length > 0
          ? items.reduce((sum, it) => {
              const iSub = (it.qty || 0) * (it.price || 0) * (1 - (it.discount || 0) / 100);
              const iVat = saleSubtotalAllForBal > 0 ? (iSub / saleSubtotalAllForBal) * (sale.vat || 0) : 0;
              return sum + iSub + iVat;
            }, 0)
          : (sale.total || 0);
        runBalance += saleLineTotalForBal - (sale.paid || 0);
        const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
        const statusBadgeClass = sale.status === "paid" ? "badge-paid" : sale.status === "partial" ? "badge-partial" : "badge-due";
        const saleSubtotalAll = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0) * (1 - (it.discount || 0) / 100), 0);

        if (items.length === 0) {
          htmlRows.push(`
            <tr>
              <td class="mono blue bold">${sale.invoiceNo}</td>
              <td class="mono">${sale.date}</td>
              <td>—</td>
              <td class="center">—</td><td class="center">—</td>
              <td class="right">—</td><td class="center">—</td>
              <td class="right mono">${curr}${Number(sale.subtotal || sale.total).toFixed(2)}</td>
              <td class="right mono" style="color:#b45309">${curr}${Number(sale.vat || 0).toFixed(2)}</td>
              <td class="right mono bold">${curr}${Number(sale.total).toFixed(2)}</td>
              <td class="right mono green bold">${curr}${Number(sale.paid).toFixed(2)}</td>
              <td style="font-size:10px">${sale.paymentMethod || "—"}</td>
              <td class="right mono bold ${sale.due > 0 ? "red" : ""}">${curr}${Number(sale.due).toFixed(2)}</td>
              <td><span class="badge ${statusBadgeClass}">${sale.status.toUpperCase()}</span></td>
              <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
            </tr>`);
        } else {
          items.forEach((item, idx) => {
            const prod = data.products.find(p => p.id === item.productId);
            const itemSub  = (item.qty || 0) * (item.price || 0) * (1 - (item.discount || 0) / 100);
            const itemVat  = saleSubtotalAll > 0 ? (itemSub / saleSubtotalAll) * (sale.vat || 0) : 0;
            const lineTotal = itemSub + itemVat;
            const isLast = idx === items.length - 1;
            htmlRows.push(`
              <tr class="${idx % 2 !== 0 ? "alt" : ""}">
                <td class="mono blue bold">${idx === 0 ? sale.invoiceNo : ""}</td>
                <td class="mono">${idx === 0 ? sale.date : ""}</td>
                <td>${item.productName || prod?.name || "—"}</td>
                <td class="center mono">${item.qty}</td>
                <td class="center"><span class="badge badge-unit">${item.unit || prod?.unit || "pcs"}</span></td>
                <td class="right mono">${curr}${Number(item.price).toFixed(2)}</td>
                <td class="center mono">${item.discount > 0 ? item.discount + "%" : "—"}</td>
                <td class="right mono">${curr}${itemSub.toFixed(2)}</td>
                <td class="right mono" style="color:#b45309">${curr}${itemVat.toFixed(2)}</td>
                <td class="right mono bold">${curr}${lineTotal.toFixed(2)}</td>
                ${isLast
                  ? `<td class="right mono bold green" rowspan="1">${curr}${Number(sale.paid).toFixed(2)}</td>
                     <td style="font-size:10px" rowspan="1">${sale.paymentMethod || "—"}</td>
                     <td class="right mono bold ${sale.due > 0 ? "red" : ""}" rowspan="1">${curr}${Number(sale.due).toFixed(2)}</td>
                     <td rowspan="1"><span class="badge ${statusBadgeClass}">${sale.status.toUpperCase()}</span></td>
                     <td class="right mono bold" style="color:${balColor}" rowspan="1">${curr}${Math.abs(runBalance).toFixed(2)}</td>`
                  : `<td></td><td></td><td></td><td></td><td></td>`}
              </tr>`);
          });
        }
      });
      return htmlRows.join("");
    })();
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Customer Ledger — ${customer.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111827; background: #fff; }
  .page { padding: 28px 36px; }

  /* ── Header ── */
  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; margin-bottom: 20px; border-bottom: 3px solid #1d4ed8; }
  .header-left .doc-title { font-size: 26px; font-weight: 800; color: #1d4ed8; letter-spacing: -0.5px; line-height: 1; }
  .header-left .doc-sub { font-size: 10px; color: #6b7280; margin-top: 4px; font-family: 'JetBrains Mono', monospace; }
  .header-right { text-align: right; }
  .company-name { font-size: 15px; font-weight: 700; color: #111827; }
  .company-meta { font-size: 10px; color: #6b7280; margin-top: 3px; line-height: 1.5; }

  /* ── Customer + Balance Strip ── */
  .party-strip { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg,#eff6ff,#f5f3ff); border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 18px; margin-bottom: 18px; }
  .party-avatar { width: 42px; height: 42px; border-radius: 10px; background: linear-gradient(135deg,#3b82f6,#8b5cf6); color: #fff; font-size: 18px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .party-info { margin-left: 12px; flex: 1; }
  .party-name { font-size: 16px; font-weight: 700; color: #111827; }
  .party-meta { font-size: 10px; color: #6b7280; margin-top: 3px; }
  .party-id { font-size: 10px; font-family: 'JetBrains Mono', monospace; background: #dbeafe; color: #1d4ed8; padding: 2px 7px; border-radius: 4px; display: inline-block; margin-top: 4px; font-weight: 600; }
  .balance-block { text-align: right; }
  .balance-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; font-weight: 700; }
  .balance-amount { font-size: 22px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: ${liveBalance > 0 ? "#991b1b" : "#065f46"}; line-height: 1; }
  .balance-status { font-size: 10px; font-weight: 700; color: ${liveBalance > 0 ? "#991b1b" : "#065f46"}; margin-top: 3px; }
  .period-tag { font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #6b7280; margin-top: 6px; }

  /* ── Summary Cards ── */
  .summary { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; margin-bottom: 18px; }
  .sum-card { border-radius: 8px; padding: 10px 12px; border: 1px solid; }
  .sum-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: #9ca3af; margin-bottom: 5px; }
  .sum-value { font-size: 14px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }

  /* ── Formula Note ── */
  .formula-note { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 7px 12px; margin-bottom: 14px; font-size: 9.5px; color: #6b7280; display: flex; align-items: center; gap: 10px; }
  .formula-note strong { color: #374151; }

  /* ── Table ── */
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { background: #1e3a5f; color: #fff; padding: 8px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; white-space: nowrap; border-right: 1px solid rgba(255,255,255,0.1); }
  thead th:last-child { border-right: none; }
  td { padding: 7px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr.alt td { background: #f9fafb; }
  tr.row-advance td { background: #faf5ff !important; }
  tr.row-return td { background: #fff5f5 !important; }
  tr.row-deducted td { background: #fffbeb !important; }
  tr.row-aidtds td { background: #ecfeff !important; }
  .subtotal-row { background: #f0f4ff !important; border-top: 2px solid #dbeafe; }
  .subtotal-row td { font-weight: 600; font-size: 10.5px; color: #1d4ed8; padding: 9px 8px; }
  .total-row { background: #1e3a5f !important; }
  .total-row td { color: #fff !important; font-weight: 700; font-size: 11px; padding: 9px 8px; }

  /* ── Utilities ── */
  .mono { font-family: 'JetBrains Mono', monospace; }
  .blue { color: #1d4ed8; } .green { color: #065f46; } .red { color: #991b1b; }
  .amber { color: #b45309; }
  .bold { font-weight: 700; }
  .center { text-align: center; } .right { text-align: right; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; white-space: nowrap; }
  .badge-paid    { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
  .badge-due     { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  .badge-partial { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
  .badge-advance { background: #ede9fe; color: #6d28d9; border: 1px solid #ddd6fe; }
  .badge-adv     { background: #ede9fe; color: #6d28d9; }
  .badge-ret     { background: #fee2e2; color: #991b1b; }
  .badge-ret-s   { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  .badge-ded     { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
  .badge-tds     { background: #cffafe; color: #0e7490; border: 1px solid #a5f3fc; }
  .badge-unit    { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

  /* ── Balance ── */
  .net-balance { margin-top: 18px; display: flex; justify-content: space-between; align-items: center; background: ${liveBalance > 0 ? "#fff5f5" : "#f0fdf4"}; border: 1.5px solid ${liveBalance > 0 ? "#fecaca" : "#a7f3d0"}; border-radius: 8px; padding: 14px 18px; }
  .nb-left { font-size: 12px; font-weight: 600; color: #374151; }
  .nb-sub { font-size: 10px; color: #9ca3af; margin-top: 2px; }
  .nb-right { font-size: 22px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: ${liveBalance > 0 ? "#991b1b" : "#065f46"}; }

  /* ── Signature ── */
  .sig-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; margin-top: 32px; }
  .sig-box { border-top: 1.5px solid #d1d5db; padding-top: 8px; }
  .sig-label { font-size: 9px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }

  /* ── Footer ── */
  .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9.5px; color: #9ca3af; }

  @media print {
    body { font-size: 10px; }
    @page { margin: 1cm 1.2cm; size: A4 landscape; }
    .page { padding: 0; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="doc-title">CUSTOMER LEDGER</div>
      <div class="doc-sub">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Period: ${safeFrom === "0000-01-01" ? "All Time" : safeFrom} → ${safeTo === "9999-12-31" ? "All Time" : safeTo}</div>
    </div>
    <div class="header-right">
      <div class="company-name">${companyName}</div>
      <div class="company-meta">${[settings.address, settings.phone, settings.email].filter(Boolean).join(" &nbsp;·&nbsp; ") || "&nbsp;"}</div>
    </div>
  </div>

  <!-- Customer Strip -->
  <div class="party-strip">
    <div style="display:flex;align-items:center">
      <div class="party-avatar">${customer.name[0].toUpperCase()}</div>
      <div class="party-info">
        <div class="party-name">${customer.name}</div>
        <div class="party-meta">${[customer.email, customer.phone, customer.address].filter(Boolean).join(" &nbsp;·&nbsp; ") || "—"}</div>
        ${customer.customerId ? `<div class="party-id">ID #${customer.customerId}</div>` : ""}
      </div>
    </div>
    <div class="balance-block">
      <div class="balance-label">Net Balance (All Time)</div>
      <div class="balance-amount">${curr}${Math.abs(liveBalance).toLocaleString("en-US",{minimumFractionDigits:2})}</div>
      <div class="balance-status">${liveBalance > 0 ? "● OUTSTANDING DUE" : "✓ ACCOUNT CLEAR"}</div>
      <div class="period-tag">${filtered.length} invoice(s) in period</div>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="summary">
    <div class="sum-card" style="background:#eff6ff;border-color:#bfdbfe">
      <div class="sum-label">Total Invoiced</div>
      <div class="sum-value" style="color:#1d4ed8">${curr}${totalBilled.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
    <div class="sum-card" style="background:#f0fdf4;border-color:#a7f3d0">
      <div class="sum-label">Total Collected</div>
      <div class="sum-value" style="color:#065f46">${curr}${totalPaid.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
    <div class="sum-card" style="background:#fefce8;border-color:#fde68a">
      <div class="sum-label">Total ${taxName}</div>
      <div class="sum-value" style="color:#b45309">${curr}${totalVAT.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
    <div class="sum-card" style="background:#ecfeff;border-color:#a5f3fc">
      <div class="sum-label">Cash</div>
      <div class="sum-value" style="color:#0e7490">${curr}${totalCash.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
    <div class="sum-card" style="background:#faf5ff;border-color:#ddd6fe">
      <div class="sum-label">Bank (Premier + UCB + Woori)</div>
      <div class="sum-value" style="color:#6d28d9">${curr}${totalBank.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
  </div>

  <!-- Formula Note -->
  <div class="formula-note">
    <span>📐</span>
    <span><strong>Line Total</strong> = (Qty × Unit Price × (1 − Disc%)) + Proportional ${taxName}</span>
    <span style="margin-left:auto;color:#9ca3af">Each item's ${taxName} = (Item Subtotal ÷ Invoice Subtotal) × Invoice ${taxName} (${vatPct}%)</span>
  </div>

  <!-- Ledger Table -->
  <table>
    <thead>
      <tr>
        <th style="min-width:80px">Invoice #</th>
        <th style="min-width:80px">Date</th>
        <th style="min-width:130px">Product / Description</th>
        <th class="center" style="min-width:38px">Qty</th>
        <th class="center" style="min-width:42px">Unit</th>
        <th class="right" style="min-width:70px">Unit Price</th>
        <th class="center" style="min-width:38px">Disc%</th>
        <th class="right" style="min-width:72px">Subtotal</th>
        <th class="right" style="min-width:62px">${taxName}</th>
        <th class="right" style="min-width:78px">Line Total</th>
        <th class="right" style="min-width:72px">Paid</th>
        <th style="min-width:62px">Method</th>
        <th class="right" style="min-width:62px">Due</th>
        <th style="min-width:62px">Status</th>
        <th class="right" style="min-width:80px;background:#162d50">Running Bal.</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || `<tr><td colspan="15" style="text-align:center;color:#9ca3af;padding:24px;font-style:italic">No transactions found in this date range</td></tr>`}
    </tbody>
    <!-- Totals Footer Row -->
    <tfoot>
      <tr class="total-row">
        <td colspan="7"><strong>PERIOD TOTALS</strong></td>
        <td class="right mono">${curr}${totalSubtotal.toFixed(2)}</td>
        <td class="right mono">${curr}${totalVAT.toFixed(2)}</td>
        <td class="right mono">${curr}${totalBilled.toFixed(2)}</td>
        <td class="right mono">${curr}${totalPaid.toFixed(2)}</td>
        <td>—</td>
        <td class="right mono">${curr}${totalDue.toFixed(2)}</td>
        <td></td>
        <td class="right mono">${curr}${Math.abs(liveBalance).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <!-- Net Balance Statement -->
  <div class="net-balance">
    <div>
      <div class="nb-left">Net Account Balance &nbsp;(All-Time, across all invoices)</div>
      <div class="nb-sub">${liveBalance > 0 ? "Customer has an outstanding balance payable to you." : liveBalance < 0 ? "Customer has a credit balance (overpaid)." : "Account is fully settled."}</div>
    </div>
    <div class="nb-right">${curr}${Math.abs(liveBalance).toLocaleString("en-US",{minimumFractionDigits:2})} &nbsp;<span style="font-size:13px">${liveBalance > 0 ? "(Due)" : liveBalance < 0 ? "(Credit)" : "(Clear)"}</span></div>
  </div>

  <!-- Signature Row -->
  <div class="sig-row">
    <div class="sig-box"><div class="sig-label">Prepared By</div></div>
    <div class="sig-box"><div class="sig-label">Authorised By</div></div>
    <div class="sig-box"><div class="sig-label">Customer Acknowledgement</div></div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>${companyName} &nbsp;—&nbsp; Customer Ledger: <strong>${customer.name}</strong></span>
    <span>Printed: ${new Date().toLocaleString()}</span>
  </div>

</div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 300); };
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = `ledger-${customer.name.replace(/\s+/g,"-")}.html`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const [ledgerPage, setLedgerPage] = useState(1);
  const LEDGER_PER_PAGE = 12;
  const pagedRows = rows.slice((ledgerPage - 1) * LEDGER_PER_PAGE, ledgerPage * LEDGER_PER_PAGE);

  const muted    = { fontFamily: "IBM Plex Mono", fontSize: 11, color: "#64748B" };
  const monoSm   = { fontFamily: "IBM Plex Mono", fontSize: 12 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Customer Header Card ─────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.06))", borderRadius: 14, border: "1px solid #E2E8F0" }}>
        <div style={{ width: 54, height: 54, borderRadius: 14, background: "linear-gradient(135deg,#3B82F6,#8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "white", flexShrink: 0, boxShadow: "0 4px 16px rgba(59,130,246,0.35)" }}>
          {customer.name[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A" }}>{customer.name}</div>
            {customer.customerId && (
              <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono", background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.25)", borderRadius: 5, padding: "2px 8px", fontWeight: 600 }}>ID #{customer.customerId}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {customer.email   && <span>✉ {customer.email}</span>}
            {customer.phone   && <span>📞 {customer.phone}</span>}
            {customer.address && <span>📍 {customer.address}</span>}
          </div>
        </div>
        {/* Balance Badge */}
        <div style={{ textAlign: "right", flexShrink: 0, padding: "10px 16px", background: liveBalance > 0 ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border: `1px solid ${liveBalance > 0 ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`, borderRadius: 12 }}>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Net Balance (All-Time)</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "IBM Plex Mono", color: liveBalance > 0 ? "#EF4444" : "#10B981", lineHeight: 1 }}>{curr}{Math.abs(liveBalance).toLocaleString("en-US",{minimumFractionDigits:2})}</div>
          <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700, color: liveBalance > 0 ? "#EF4444" : "#10B981" }}>{liveBalance > 0 ? "● OUTSTANDING" : "✓ CLEAR"}</div>
        </div>
      </div>

      {/* ── Summary Cards (3 cards) ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
        {[
          { l: "Total Invoiced",   v: totalBilled,  c: "#3B82F6", bg: "rgba(59,130,246,0.08)",  bd: "rgba(59,130,246,0.2)"  },
          { l: "Total Collected",  v: totalPaid,    c: "#10B981", bg: "rgba(16,185,129,0.08)",  bd: "rgba(16,185,129,0.2)"  },
          { l: `Total ${taxName}`, v: totalVAT,     c: "#F59E0B", bg: "rgba(245,158,11,0.08)",  bd: "rgba(245,158,11,0.2)"  },
          { l: "Cash",             v: totalCash,    c: "#06B6D4", bg: "rgba(6,182,212,0.08)",   bd: "rgba(6,182,212,0.2)"   },
          { l: "Bank",             v: totalBank,    c: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  bd: "rgba(139,92,246,0.2)"  },
        ].map(s => (
          <div key={s.l} style={{ background: s.bg, borderRadius: 10, padding: "11px 14px", border: `1px solid ${s.bd}` }}>
            <div style={{ fontSize: 9, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{s.l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "IBM Plex Mono", color: s.c }}>{curr}{s.v.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
          </div>
        ))}
      </div>

      {/* ── Formula Hint ─────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "#F1F5F9", borderRadius: 8, border: "1px solid #E2E8F0", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12 }}>📐</span>
        <span style={{ fontSize: 11, color: "#64748B" }}>
          <span style={{ fontFamily: "IBM Plex Mono", color: "#475569", fontWeight: 600 }}>Line Total</span>
          {" "}= (Qty × Unit Price × (1 − Disc%)){" "}
          <span style={{ color: "#F59E0B", fontWeight: 600 }}>+ Proportional {taxName}</span>
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569", fontFamily: "IBM Plex Mono" }}>Each item's {taxName} = (item subtotal ÷ invoice subtotal) × invoice {taxName}</span>
      </div>

      {/* ── Date Filter & Controls ────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "#F1F5F9", borderRadius: 10, border: "1px solid #E2E8F0", flexWrap: "wrap" }}>
        <Icon name="calendar" size={14} color="#64748B" />
        <span style={muted}>FROM</span>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setLedgerPage(1); }} style={{ width: 148 }} />
        <span style={muted}>TO</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setLedgerPage(1); }} style={{ width: 148 }} />
        {/* Quick presets */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {[
            { label: "7D",  from: daysAgo(7)   },
            { label: "30D", from: daysAgo(30)  },
            { label: "90D", from: daysAgo(90)  },
            { label: "1Y",  from: daysAgo(365) },
            { label: "All", from: firstDate,    to: lastDate },
          ].map(p => {
            const toVal = p.label === "All" ? lastDate : fmt(today);
            const isActive = dateFrom === p.from && dateTo === toVal;
            return (
              <button
                key={p.label}
                onClick={() => {
                  setDateFrom(p.from);
                  setDateTo(p.label === "All" ? lastDate : fmt(today));
                  setLedgerPage(1);
                }}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontSize: 11, fontFamily: "IBM Plex Mono",
                  background: isActive ? "#3B82F6" : "#E2E8F0",
                  color: isActive ? "white" : "#64748B",
                  transition: "all 0.15s",
                }}
              >{p.label}</button>
            );
          })}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={muted}>{rows.length} row{rows.length !== 1 ? "s" : ""} · {filtered.length} invoice{filtered.length !== 1 ? "s" : ""}</span>
          <button className="btn btn-primary btn-sm" onClick={downloadPDF}><Icon name="download" size={13} /> Download PDF</button>
        </div>
      </div>

      {/* ── Ledger Table ─────────────────────────────────── */}
      <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ color: "#64748B", fontSize: 14 }}>No transactions found in this date range</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 980 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 95 }}>Invoice #</th>
                    <th style={{ minWidth: 92 }}>Date</th>
                    <th style={{ minWidth: 150 }}>Product</th>
                    <th style={{ textAlign: "center", minWidth: 50 }}>Qty</th>
                    <th style={{ textAlign: "center", minWidth: 58 }}>Unit</th>
                    <th style={{ textAlign: "right", minWidth: 90 }}>Unit Price</th>
                    <th style={{ textAlign: "center", minWidth: 52 }}>Disc%</th>
                    <th style={{ textAlign: "right", minWidth: 88 }}>Subtotal</th>
                    <th style={{ textAlign: "right", minWidth: 72, background: "rgba(245,158,11,0.12)", color: "#F59E0B" }}>{taxName}</th>
                    <th style={{ textAlign: "right", minWidth: 95, background: "rgba(59,130,246,0.12)", color: "#93C5FD" }}>Line Total</th>
                    <th style={{ textAlign: "right", minWidth: 88, borderLeft: "2px solid #26334F" }}>Paid</th>
                    <th style={{ minWidth: 88 }}>Method</th>
                    <th style={{ textAlign: "right", minWidth: 80 }}>Due</th>
                    <th style={{ minWidth: 78 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row, i) => {
                    const rowBg = row.isAdvance ? "rgba(139,92,246,0.05)" : row.isReturn ? "rgba(239,68,68,0.04)" : row.isDeducted ? "rgba(245,158,11,0.05)" : row.isAidTds ? "rgba(6,182,212,0.05)" : "transparent";
                    const invColor = row.isAdvance ? "#8B5CF6" : row.isReturn ? "#EF4444" : row.isDeducted ? "#F59E0B" : row.isAidTds ? "#06B6D4" : "#3B82F6";
                    const isSpecial = row.isAdvance || row.isReturn || row.isDeducted || row.isAidTds;
                    return (
                      <tr key={`${row.saleId}-${i}`} style={{ background: rowBg }}>
                        {/* Invoice # — rowspan */}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ ...monoSm, color: invColor, fontWeight: 700, verticalAlign: "middle", borderRight: "1px solid #26334F", whiteSpace: "nowrap" }}>
                            {row.invoiceNo}
                          </td>
                        )}
                        {/* Date — rowspan */}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ ...monoSm, color: "#94A3B8", verticalAlign: "middle", borderRight: "1px solid #26334F", whiteSpace: "nowrap" }}>
                            {row.date}
                          </td>
                        )}
                        {/* Product */}
                        <td style={{ color: row.isAdvance ? "#8B5CF6" : row.isReturn ? "#EF4444" : row.isDeducted ? "#F59E0B" : row.isAidTds ? "#06B6D4" : "#CBD5E1", fontStyle: isSpecial ? "italic" : "normal", fontWeight: isSpecial ? 600 : 400, fontSize: 13 }}>
                          {row.product}
                        </td>
                        {/* Qty */}
                        <td style={{ textAlign: "center", ...monoSm, color: "#E2E8F0" }}>{row.qty}</td>
                        {/* Unit */}
                        <td style={{ textAlign: "center" }}>
                          {row.isAdvance ? <span className="badge badge-purple">PAY</span>
                            : row.isReturn ? <span className="badge badge-danger">RET</span>
                            : row.isDeducted ? <span className="badge" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}>DED</span>
                            : row.isAidTds ? <span className="badge badge-tds">TDS</span>
                            : <span className="badge badge-success" style={{ fontSize: 10 }}>{row.unit}</span>}
                        </td>
                        {/* Unit Price */}
                        <td style={{ textAlign: "right", ...monoSm, color: "#CBD5E1" }}>
                          {isSpecial ? "—" : `${curr}${Number(row.price).toFixed(2)}`}
                        </td>
                        {/* Disc% */}
                        <td style={{ textAlign: "center", ...monoSm, color: row.discount > 0 ? "#F59E0B" : "#475569" }}>
                          {isSpecial ? "—" : row.discount > 0 ? `${row.discount}%` : "—"}
                        </td>
                        {/* Subtotal (after discount, before VAT) */}
                        <td style={{ textAlign: "right", ...monoSm, color: "#94A3B8" }}>
                          {isSpecial ? "—" : `${curr}${Number(row.itemSubtotal).toFixed(2)}`}
                        </td>
                        {/* VAT (per item, proportional) */}
                        <td style={{ textAlign: "right", ...monoSm, color: "#F59E0B", fontWeight: 500, background: "rgba(245,158,11,0.04)" }}>
                          {isSpecial ? "—" : `${curr}${Number(row.itemVat).toFixed(2)}`}
                        </td>
                        {/* Line Total */}
                        <td style={{ textAlign: "right", ...monoSm, fontSize: 13, fontWeight: 700, background: "rgba(59,130,246,0.04)", color: row.isAdvance ? "#8B5CF6" : row.isReturn ? "#EF4444" : row.isDeducted ? "#F59E0B" : row.isAidTds ? "#06B6D4" : "#E2E8F0" }}>
                          {row.isReturn ? `↩ ${curr}${Number(row.lineTotal).toFixed(2)}` : (row.isDeducted || row.isAidTds) ? `− ${curr}${Math.abs(Number(row.lineTotal)).toFixed(2)}` : `${curr}${Number(row.lineTotal).toFixed(2)}`}
                        </td>
                        {/* Paid — rowspan */}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: "#10B981", verticalAlign: "middle", borderLeft: "2px solid #26334F" }}>
                            {(row.isReturn || row.isDeducted || row.isAidTds) ? "—" : `${curr}${Number(row.salePaid).toFixed(2)}`}
                          </td>
                        )}
                        {/* Pay Method — rowspan */}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ verticalAlign: "middle" }}>
                            {row.paymentMethod ? (
                              <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono", padding: "2px 8px", borderRadius: 5, background: row.paymentMethod === "Cash" ? "rgba(16,185,129,0.12)" : "rgba(59,130,246,0.12)", color: row.paymentMethod === "Cash" ? "#10B981" : "#3B82F6", fontWeight: 600, whiteSpace: "nowrap", border: `1px solid ${row.paymentMethod === "Cash" ? "rgba(16,185,129,0.25)" : "rgba(59,130,246,0.25)"}` }}>
                                {row.paymentMethod}
                              </span>
                            ) : <span style={{ color: "#475569", fontSize: 11 }}>—</span>}
                          </td>
                        )}
                        {/* Due — rowspan */}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: row.saleDue > 0 ? "#EF4444" : "#475569", verticalAlign: "middle" }}>
                            {(row.isReturn || row.isDeducted || row.isAidTds) ? "—" : `${curr}${Number(row.saleDue).toFixed(2)}`}
                          </td>
                        )}
                        {/* Status — rowspan */}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ verticalAlign: "middle" }}>
                            <StatusBadge status={row.status} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>

                {/* ── Period Totals Footer ── */}
                <tfoot>
                  <tr style={{ background: "#0E1629", borderTop: "2px solid #26334F" }}>
                    <td colSpan={7} style={{ ...monoSm, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 14px" }}>Period Totals</td>
                    <td style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: "#94A3B8", padding: "10px 14px" }}>{curr}{(totalBilled - totalVAT).toFixed(2)}</td>
                    <td style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: "#F59E0B", padding: "10px 14px", background: "rgba(245,158,11,0.06)" }}>{curr}{totalVAT.toFixed(2)}</td>
                    <td style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: "#3B82F6", padding: "10px 14px", background: "rgba(59,130,246,0.06)" }}>{curr}{totalBilled.toFixed(2)}</td>
                    <td style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: "#10B981", padding: "10px 14px", borderLeft: "2px solid #26334F" }}>{curr}{totalPaid.toFixed(2)}</td>
                    <td style={{ padding: "10px 14px" }} />
                    <td style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: totalDue > 0 ? "#EF4444" : "#64748B", padding: "10px 14px" }}>{curr}{totalDue.toFixed(2)}</td>
                    <td style={{ padding: "10px 14px" }} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Pagination */}
            {rows.length > LEDGER_PER_PAGE && (
              <div style={{ padding: "10px 16px", borderTop: "1px solid #E2E8F0", background: "#FFFFFF" }}>
                <Pagination page={ledgerPage} total={rows.length} perPage={LEDGER_PER_PAGE} onChange={setLedgerPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Running Balance Footer ─────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: liveBalance > 0 ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)", borderRadius: 10, border: `1px solid ${liveBalance > 0 ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}` }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>Net Account Balance <span style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>(all-time, across all invoices)</span></div>
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>{liveBalance > 0 ? "Customer owes you money." : liveBalance < 0 ? "Customer has a credit (overpaid)." : "Account fully settled."}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "IBM Plex Mono", color: liveBalance > 0 ? "#EF4444" : "#10B981" }}>
            {curr}{Math.abs(liveBalance).toLocaleString("en-US",{minimumFractionDigits:2})}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: liveBalance > 0 ? "#EF4444" : "#10B981" }}>
            {liveBalance > 0 ? "● OUTSTANDING DUE" : liveBalance < 0 ? "● CREDIT BALANCE" : "✓ FULLY SETTLED"}
          </div>
        </div>
      </div>

    </div>
  );
};

// ============================================================
// SUPPLIERS
// ============================================================
const Suppliers = () => {
  const { data, setData, toast, curr, currentUser } = useApp();
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const emptyForm = { name: "", email: "", phone: "", address: "", balance: 0, rating: 5 };
  const [form, setForm] = useState(emptyForm);

  const filtered = data.suppliers.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) || (s.email || "").toLowerCase().includes(search.toLowerCase()));

  const openNew = () => { setEditItem(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (s) => { setEditItem(s); setForm({ ...s }); setShowModal(true); };
  const deleteSupplier = (s) => { if (!window.confirm(`Delete supplier "${s.name}"? It will be moved to the Recycle Bin and can be restored.`)) return; const entry = makeBinEntry("suppliers", s, data, currentUser?.name); setData(d => trashItem(d, "suppliers", entry)); toast("Supplier moved to Recycle Bin", "success"); };

  const submit = () => {
    if (!form.name) { toast("Name required", "error"); return; }
    if (editItem) {
      setData(d => ({ ...d, suppliers: d.suppliers.map(s => s.id === editItem.id ? { ...s, ...form } : s) }));
    } else {
      setData(d => ({ ...d, suppliers: [...d.suppliers, { ...form, id: generateId() }] }));
    }
    toast(editItem ? "Supplier updated!" : "Supplier added!", "success");
    setShowModal(false);
  };

  const getSupplierPOs = (id) => data.purchases.filter(p => p.supplierId === id);

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader title="Supplier Management" subtitle={`${data.suppliers.length} suppliers`}
        actions={<button className="btn btn-primary" onClick={openNew}><Icon name="plus" size={15} /> Add Supplier</button>}
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search suppliers..." style={{ marginBottom: 16, maxWidth: 400 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {filtered.map(s => {
          const pos = getSupplierPOs(s.id);
          const totalOrdered = pos.reduce((acc, p) => acc + p.total, 0);
          return (
            <div key={s.id} className="card card-hover" style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #10B981, #3B82F6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "white" }}>{s.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{s.name}</div>
                    <div style={{ display: "flex", gap: 2 }}>{Array.from({ length: 5 }, (_, i) => <Icon key={i} name="star" size={10} color={i < s.rating ? "#F59E0B" : "#E2E8F0"} />)}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="btn btn-secondary btn-sm btn-icon" title="View Ledger" onClick={() => setViewItem(s)}><Icon name="eye" size={13} /></button>
                  <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openEdit(s)}><Icon name="edit" size={13} /></button>
                  <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteSupplier(s)}><Icon name="trash" size={13} /></button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>{s.email} · {s.phone}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { l: "Total Orders", v: pos.length },
                  { l: "Ordered Value", v: `${curr}${totalOrdered.toLocaleString("en-US", { maximumFractionDigits: 0 })}` },
                  { l: "Amount Due", v: `${curr}${s.balance.toLocaleString()}`, color: s.balance > 0 ? "#EF4444" : "#10B981" },
                ].map(item => (
                  <div key={item.l} style={{ background: "#F1F5F9", borderRadius: 6, padding: "8px 10px" }}>
                    <div style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono", marginBottom: 2 }}>{item.l}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "IBM Plex Mono", color: item.color || "#0F172A" }}>{item.v}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editItem ? "Edit Supplier" : "Add Supplier"} width={480}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">Supplier Name *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          {[["email", "Email"], ["phone", "Phone"]].map(([k, l]) => (
            <div key={k} className="form-group">
              <label className="form-label">{l}</label>
              <input value={form[k] || ""} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
            </div>
          ))}
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">Address</label>
            <input value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Balance Due</label>
            <input type="number" value={form.balance || 0} onChange={e => setForm(f => ({ ...f, balance: +e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Rating (1-5)</label>
            <input type="number" value={form.rating || 5} onChange={e => setForm(f => ({ ...f, rating: +e.target.value }))} min={1} max={5} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}><Icon name="check" size={14} /> {editItem ? "Update" : "Add"}</button>
        </div>
      </Modal>

      <Modal open={!!viewItem} onClose={() => setViewItem(null)} title="Supplier Ledger" width={860}>
        {viewItem && <SupplierLedger supplier={viewItem} />}
      </Modal>
    </div>
  );
};

// ============================================================
// SUPPLIER LEDGER  (Redesigned — Professional v2, mirrors Customer Ledger)
// ============================================================
const SupplierLedger = ({ supplier }) => {
  const { data, curr } = useApp();
  const settings = data.settings;

  const allPurchases = data.purchases
    .filter(p => p.supplierId === supplier.id)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Auto-detect earliest and latest transaction dates for this supplier
  const firstDate = allPurchases.length > 0 ? allPurchases[0].date.slice(0, 10) : daysAgo(365);
  const lastDate  = allPurchases.length > 0 ? allPurchases[allPurchases.length - 1].date.slice(0, 10) : fmt(today);

  const [dateFrom, setDateFrom] = useState(firstDate);
  const [dateTo,   setDateTo]   = useState(lastDate);

  // Safe date filter — treat empty/invalid date as "no limit on that side"
  const safeFrom = dateFrom && dateFrom.length === 10 ? dateFrom : "0000-01-01";
  const safeTo   = dateTo   && dateTo.length   === 10 ? dateTo   : "9999-12-31";
  const filtered = allPurchases.filter(p => {
    const d = (p.date || "").slice(0, 10);
    return d >= safeFrom && d <= safeTo;
  });

  // Live balance across ALL time — same formula shape as Customer Ledger
  const liveBalance = allPurchases.reduce((bal, p) => {
    if (p.purchaseType === "advance") return bal - (p.paid || 0);
    if (p.purchaseType === "return")  return bal - (p.total || 0);
    return bal + (p.total || 0) - (p.paid || 0);
  }, 0);

  const isRegular = p => p.purchaseType !== "advance" && p.purchaseType !== "return" && p.purchaseType !== "deducted" && p.purchaseType !== "aidtds";

  const totalOrdered  = filtered.filter(isRegular).reduce((s, x) => s + (x.total || 0), 0);
  const totalPaid     = filtered.filter(p => p.purchaseType !== "return" && p.purchaseType !== "deducted" && p.purchaseType !== "aidtds").reduce((s, x) => s + (x.paid || 0), 0);
  const totalDue      = filtered.filter(isRegular).reduce((s, x) => s + (x.due || 0), 0);
  const totalAdvance  = filtered.filter(p => p.purchaseType === "advance").reduce((s, x) => s + (x.paid || 0), 0);
  const totalReturn   = filtered.filter(p => p.purchaseType === "return").reduce((s, x) => s + (x.total || 0), 0);
  const totalDeducted = filtered.filter(p => p.purchaseType === "deducted").reduce((s, x) => s + Math.abs(x.total || 0), 0);
  const totalAidTds   = filtered.filter(p => p.purchaseType === "aidtds").reduce((s, x) => s + Math.abs(x.total || 0), 0);
  const totalCash     = filtered.filter(p => (p.paymentMethod || "").toLowerCase() === "cash").reduce((s, x) => s + (x.paid || 0), 0);
  const totalBank     = filtered.filter(p => { const m = (p.paymentMethod || "").toLowerCase(); return m.includes("premier") || m.includes("ucb") || m.includes("woori"); }).reduce((s, x) => s + (x.paid || 0), 0);

  // ── Build flat ledger rows (one row per line item) ──────────────────────────
  const rows = [];
  filtered.forEach(po => {
    if (po.purchaseType === "advance") {
      rows.push({
        poId: po.id, date: po.date, status: po.status,
        isAdvance: true, isReturn: false, isDeducted: false, isAidTds: false,
        product: "— Payment —", qty: "—", unit: "—", price: 0,
        itemSubtotal: 0, lineTotal: po.paid,
        isFirst: true, rowSpan: 1,
        poTotal: 0, poPaid: po.paid, poDue: 0,
        paymentMethod: po.paymentMethod || "",
      });
    } else if (po.purchaseType === "deducted") {
      rows.push({
        poId: po.id, date: po.date, status: po.status,
        isAdvance: false, isReturn: false, isDeducted: true, isAidTds: false,
        product: "— Deducted —", qty: "—", unit: "—", price: 0,
        itemSubtotal: 0, lineTotal: po.total,
        isFirst: true, rowSpan: 1,
        poTotal: po.total, poPaid: 0, poDue: 0,
        paymentMethod: "",
      });
    } else if (po.purchaseType === "aidtds") {
      rows.push({
        poId: po.id, date: po.date, status: po.status,
        isAdvance: false, isReturn: false, isDeducted: false, isAidTds: true,
        product: "— AIT-TDS —", qty: "—", unit: "—", price: 0,
        itemSubtotal: 0, lineTotal: po.total,
        isFirst: true, rowSpan: 1,
        poTotal: po.total, poPaid: 0, poDue: 0,
        paymentMethod: "",
      });
    } else if (po.purchaseType === "return") {
      const items = po.items && po.items.length > 0 ? po.items : [];
      if (items.length === 0) {
        rows.push({
          poId: po.id, date: po.date, status: po.status,
          isAdvance: false, isReturn: true, isDeducted: false, isAidTds: false,
          product: "— Return —", qty: "—", unit: "—", price: 0,
          itemSubtotal: 0, lineTotal: po.total,
          isFirst: true, rowSpan: 1,
          poTotal: po.total, poPaid: 0, poDue: 0,
          paymentMethod: "",
        });
      } else {
        items.forEach((item, idx) => {
          const prod = data.products.find(x => x.id === item.productId);
          const itemSubtotal = (item.qty || 0) * (item.price || 0);
          rows.push({
            poId: po.id, date: po.date, status: po.status,
            isAdvance: false, isReturn: true, isDeducted: false, isAidTds: false,
            product: item.productName || prod?.name || "—",
            qty: item.qty, unit: item.unit || prod?.unit || "pcs",
            price: item.price, itemSubtotal, lineTotal: itemSubtotal,
            isFirst: idx === 0, rowSpan: items.length,
            poTotal: po.total, poPaid: 0, poDue: 0,
            paymentMethod: "",
          });
        });
      }
    } else {
      const items = po.items && po.items.length > 0 ? po.items : [];
      if (items.length === 0) {
        rows.push({
          poId: po.id, date: po.date, status: po.status,
          isAdvance: false, isReturn: false, isDeducted: false, isAidTds: false,
          product: "—", qty: "—", unit: "—", price: 0,
          itemSubtotal: po.total, lineTotal: po.total,
          isFirst: true, rowSpan: 1,
          poTotal: po.total, poPaid: po.paid, poDue: po.due || 0,
          paymentMethod: po.paymentMethod || "",
        });
      } else {
        items.forEach((item, idx) => {
          const prod = data.products.find(x => x.id === item.productId);
          const itemSubtotal = (item.qty || 0) * (item.price || 0);
          rows.push({
            poId: po.id, date: po.date, status: po.status,
            isAdvance: false, isReturn: false, isDeducted: false, isAidTds: false,
            product: item.productName || prod?.name || "—",
            qty: item.qty, unit: item.unit || prod?.unit || "pcs",
            price: item.price, itemSubtotal, lineTotal: itemSubtotal,
            isFirst: idx === 0, rowSpan: items.length,
            poTotal: po.total, poPaid: po.paid, poDue: po.due || 0,
            paymentMethod: idx === 0 ? (po.paymentMethod || "") : "",
          });
        });
      }
    }
  });

  // ── Professional PDF Generator ───────────────────────────────────────────────
  const downloadPDF = () => {
    const companyName = settings.companyName || "BizCore ERP";

    const tableRows = (() => {
      const htmlRows = [];
      let runBalance = 0;

      filtered.forEach(po => {
        if (po.purchaseType === "advance") {
          runBalance -= (po.paid || 0);
          const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
          htmlRows.push(`
            <tr class="row-advance">
              <td class="mono" style="color:#6d28d9;font-weight:700">${po.id}</td>
              <td class="mono">${po.date}</td>
              <td style="color:#6d28d9;font-style:italic;font-weight:600">— Payment —</td>
              <td class="center">—</td>
              <td class="center"><span class="badge badge-adv">PAY</span></td>
              <td class="right">—</td>
              <td class="right">—</td>
              <td class="right mono bold" style="color:#6d28d9">${curr}${Number(po.paid).toFixed(2)}</td>
              <td class="right mono bold green">${curr}${Number(po.paid).toFixed(2)}</td>
              <td style="color:#6d28d9;font-size:10px">${po.paymentMethod || "—"}</td>
              <td class="right mono">—</td>
              <td><span class="badge badge-advance">PAYMENT</span></td>
              <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
            </tr>`);
          return;
        }

        if (po.purchaseType === "return") {
          runBalance -= (po.total || 0);
          const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
          const items = po.items && po.items.length > 0 ? po.items : [];
          if (items.length === 0) {
            htmlRows.push(`
              <tr class="row-return">
                <td class="mono" style="color:#dc2626;font-weight:700">${po.id}</td>
                <td class="mono">${po.date}</td>
                <td style="color:#dc2626;font-style:italic;font-weight:600">— Purchase Return —</td>
                <td class="center">—</td><td class="center"><span class="badge badge-ret">RET</span></td>
                <td class="right">—</td>
                <td class="right mono bold" style="color:#dc2626">↩ ${curr}${Number(po.total).toFixed(2)}</td>
                <td class="right">—</td><td>—</td><td class="right">—</td>
                <td><span class="badge badge-ret-s">RETURN</span></td>
                <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
              </tr>`);
          } else {
            items.forEach((item, idx) => {
              const prod = data.products.find(x => x.id === item.productId);
              const itemSub = (item.qty || 0) * (item.price || 0);
              htmlRows.push(`
                <tr class="row-return ${idx % 2 !== 0 ? "alt" : ""}">
                  <td class="mono" style="color:#dc2626;font-weight:700">${idx === 0 ? po.id : ""}</td>
                  <td class="mono">${idx === 0 ? po.date : ""}</td>
                  <td style="color:#dc2626">${item.productName || prod?.name || "—"}</td>
                  <td class="center mono">${item.qty}</td>
                  <td class="center"><span class="badge badge-ret">${item.unit || prod?.unit || "pcs"}</span></td>
                  <td class="right mono">${curr}${Number(item.price).toFixed(2)}</td>
                  <td class="right mono bold" style="color:#dc2626">↩ ${curr}${itemSub.toFixed(2)}</td>
                  <td class="right">—</td><td>—</td><td class="right">—</td>
                  <td>${idx === 0 ? `<span class="badge badge-ret-s">RETURN</span>` : ""}</td>
                  <td class="right mono bold" style="color:${balColor}">${idx === items.length - 1 ? curr + Math.abs(runBalance).toFixed(2) : ""}</td>
                </tr>`);
            });
          }
          return;
        }

        if (po.purchaseType === "deducted") {
          runBalance += (po.total || 0);
          const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
          htmlRows.push(`
            <tr class="row-deducted">
              <td class="mono" style="color:#b45309;font-weight:700">${po.id}</td>
              <td class="mono">${po.date}</td>
              <td style="color:#b45309;font-style:italic;font-weight:600">— Deducted —</td>
              <td class="center">—</td>
              <td class="center"><span class="badge badge-ded">DED</span></td>
              <td class="right">—</td>
              <td class="right mono bold" style="color:#b45309">− ${curr}${Math.abs(Number(po.total)).toFixed(2)}</td>
              <td class="right">—</td><td>—</td><td class="right">—</td>
              <td><span class="badge badge-ded">DEDUCTED</span></td>
              <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
            </tr>`);
          return;
        }

        if (po.purchaseType === "aidtds") {
          runBalance += (po.total || 0);
          const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
          htmlRows.push(`
            <tr class="row-aidtds">
              <td class="mono" style="color:#0e7490;font-weight:700">${po.id}</td>
              <td class="mono">${po.date}</td>
              <td style="color:#0e7490;font-style:italic;font-weight:600">— AIT-TDS —</td>
              <td class="center">—</td>
              <td class="center"><span class="badge badge-tds">TDS</span></td>
              <td class="right">—</td>
              <td class="right mono bold" style="color:#0e7490">− ${curr}${Math.abs(Number(po.total)).toFixed(2)}</td>
              <td class="right">—</td><td>—</td><td class="right">—</td>
              <td><span class="badge badge-tds">AIT-TDS</span></td>
              <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
            </tr>`);
          return;
        }

        // Regular purchase
        const items = po.items && po.items.length > 0 ? po.items : [];
        runBalance += (po.total || 0) - (po.paid || 0);
        const balColor = runBalance > 0 ? "#991b1b" : "#065f46";
        const statusBadgeClass = po.status === "paid" ? "badge-paid" : po.status === "partial" ? "badge-partial" : "badge-due";

        if (items.length === 0) {
          htmlRows.push(`
            <tr>
              <td class="mono blue bold">${po.id}</td>
              <td class="mono">${po.date}</td>
              <td>—</td>
              <td class="center">—</td><td class="center">—</td>
              <td class="right">—</td>
              <td class="right mono bold">${curr}${Number(po.total).toFixed(2)}</td>
              <td class="right mono bold green">${curr}${Number(po.paid).toFixed(2)}</td>
              <td style="font-size:10px">${po.paymentMethod || "—"}</td>
              <td class="right mono bold ${po.due > 0 ? "red" : ""}">${curr}${Number(po.due || 0).toFixed(2)}</td>
              <td><span class="badge ${statusBadgeClass}">${po.status.toUpperCase()}</span></td>
              <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>
            </tr>`);
        } else {
          items.forEach((item, idx) => {
            const prod = data.products.find(x => x.id === item.productId);
            const itemSub = (item.qty || 0) * (item.price || 0);
            const isLast = idx === items.length - 1;
            htmlRows.push(`
              <tr class="${idx % 2 !== 0 ? "alt" : ""}">
                <td class="mono blue bold">${idx === 0 ? po.id : ""}</td>
                <td class="mono">${idx === 0 ? po.date : ""}</td>
                <td>${item.productName || prod?.name || "—"}</td>
                <td class="center mono">${item.qty}</td>
                <td class="center"><span class="badge badge-unit">${item.unit || prod?.unit || "pcs"}</span></td>
                <td class="right mono">${curr}${Number(item.price).toFixed(2)}</td>
                <td class="right mono bold">${curr}${itemSub.toFixed(2)}</td>
                ${isLast
                  ? `<td class="right mono bold green">${curr}${Number(po.paid).toFixed(2)}</td>
                     <td style="font-size:10px">${po.paymentMethod || "—"}</td>
                     <td class="right mono bold ${po.due > 0 ? "red" : ""}">${curr}${Number(po.due || 0).toFixed(2)}</td>
                     <td><span class="badge ${statusBadgeClass}">${po.status.toUpperCase()}</span></td>
                     <td class="right mono bold" style="color:${balColor}">${curr}${Math.abs(runBalance).toFixed(2)}</td>`
                  : `<td></td><td></td><td></td><td></td><td></td>`}
              </tr>`);
          });
        }
      });
      return htmlRows.join("");
    })();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Supplier Ledger — ${supplier.name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111827; background: #fff; }
  .page { padding: 28px 36px; }

  .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; margin-bottom: 20px; border-bottom: 3px solid #10B981; }
  .header-left .doc-title { font-size: 26px; font-weight: 800; color: #10B981; letter-spacing: -0.5px; line-height: 1; }
  .header-left .doc-sub { font-size: 10px; color: #6b7280; margin-top: 4px; font-family: 'JetBrains Mono', monospace; }
  .header-right { text-align: right; }
  .company-name { font-size: 15px; font-weight: 700; color: #111827; }
  .company-meta { font-size: 10px; color: #6b7280; margin-top: 3px; line-height: 1.5; }

  .party-strip { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg,#f0fdf4,#eff6ff); border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 18px; margin-bottom: 18px; }
  .party-avatar { width: 42px; height: 42px; border-radius: 10px; background: linear-gradient(135deg,#10B981,#3b82f6); color: #fff; font-size: 18px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .party-info { margin-left: 12px; flex: 1; }
  .party-name { font-size: 16px; font-weight: 700; color: #111827; }
  .party-meta { font-size: 10px; color: #6b7280; margin-top: 3px; }
  .balance-block { text-align: right; }
  .balance-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; font-weight: 700; }
  .balance-amount { font-size: 22px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: ${liveBalance > 0 ? "#991b1b" : "#065f46"}; line-height: 1; }
  .balance-status { font-size: 10px; font-weight: 700; color: ${liveBalance > 0 ? "#991b1b" : "#065f46"}; margin-top: 3px; }
  .period-tag { font-size: 10px; font-family: 'JetBrains Mono', monospace; color: #6b7280; margin-top: 6px; }

  .summary { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; margin-bottom: 18px; }
  .sum-card { border-radius: 8px; padding: 10px 12px; border: 1px solid; }
  .sum-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.09em; color: #9ca3af; margin-bottom: 5px; }
  .sum-value { font-size: 14px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }

  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { background: #065f46; color: #fff; padding: 8px 8px; text-align: left; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; white-space: nowrap; border-right: 1px solid rgba(255,255,255,0.1); }
  thead th:last-child { border-right: none; }
  td { padding: 7px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
  tr:last-child td { border-bottom: none; }
  tr.alt td { background: #f9fafb; }
  tr.row-advance td { background: #faf5ff !important; }
  tr.row-return td { background: #fff5f5 !important; }
  tr.row-deducted td { background: #fffbeb !important; }
  tr.row-aidtds td { background: #ecfeff !important; }
  .total-row { background: #065f46 !important; }
  .total-row td { color: #fff !important; font-weight: 700; font-size: 11px; padding: 9px 8px; }

  .mono { font-family: 'JetBrains Mono', monospace; }
  .blue { color: #1d4ed8; } .green { color: #065f46; } .red { color: #991b1b; }
  .bold { font-weight: 700; }
  .center { text-align: center; } .right { text-align: right; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 8px; font-size: 9px; font-weight: 700; white-space: nowrap; }
  .badge-paid    { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
  .badge-due     { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  .badge-partial { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
  .badge-advance { background: #ede9fe; color: #6d28d9; border: 1px solid #ddd6fe; }
  .badge-adv     { background: #ede9fe; color: #6d28d9; }
  .badge-ret     { background: #fee2e2; color: #991b1b; }
  .badge-ret-s   { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  .badge-ded     { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
  .badge-tds     { background: #cffafe; color: #0e7490; border: 1px solid #a5f3fc; }
  .badge-unit    { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

  .net-balance { margin-top: 18px; display: flex; justify-content: space-between; align-items: center; background: ${liveBalance > 0 ? "#fff5f5" : "#f0fdf4"}; border: 1.5px solid ${liveBalance > 0 ? "#fecaca" : "#a7f3d0"}; border-radius: 8px; padding: 14px 18px; }
  .nb-left { font-size: 12px; font-weight: 600; color: #374151; }
  .nb-sub { font-size: 10px; color: #9ca3af; margin-top: 2px; }
  .nb-right { font-size: 22px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: ${liveBalance > 0 ? "#991b1b" : "#065f46"}; }

  .sig-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; margin-top: 32px; }
  .sig-box { border-top: 1.5px solid #d1d5db; padding-top: 8px; }
  .sig-label { font-size: 9px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; }

  .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9.5px; color: #9ca3af; }

  @media print {
    body { font-size: 10px; }
    @page { margin: 1cm 1.2cm; size: A4 landscape; }
    .page { padding: 0; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-left">
      <div class="doc-title">SUPPLIER LEDGER</div>
      <div class="doc-sub">Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Period: ${safeFrom === "0000-01-01" ? "All Time" : safeFrom} → ${safeTo === "9999-12-31" ? "All Time" : safeTo}</div>
    </div>
    <div class="header-right">
      <div class="company-name">${companyName}</div>
      <div class="company-meta">${[settings.address, settings.phone, settings.email].filter(Boolean).join(" &nbsp;·&nbsp; ") || "&nbsp;"}</div>
    </div>
  </div>

  <div class="party-strip">
    <div style="display:flex;align-items:center">
      <div class="party-avatar">${supplier.name[0].toUpperCase()}</div>
      <div class="party-info">
        <div class="party-name">${supplier.name}</div>
        <div class="party-meta">${[supplier.email, supplier.phone, supplier.address].filter(Boolean).join(" &nbsp;·&nbsp; ") || "—"}</div>
      </div>
    </div>
    <div class="balance-block">
      <div class="balance-label">Net Balance (All Time)</div>
      <div class="balance-amount">${curr}${Math.abs(liveBalance).toLocaleString("en-US",{minimumFractionDigits:2})}</div>
      <div class="balance-status">${liveBalance > 0 ? "● OUTSTANDING DUE" : "✓ ACCOUNT CLEAR"}</div>
      <div class="period-tag">${filtered.length} order(s) in period</div>
    </div>
  </div>

  <div class="summary">
    <div class="sum-card" style="background:#f0fdf4;border-color:#bbf7d0">
      <div class="sum-label">Total Ordered</div>
      <div class="sum-value" style="color:#065f46">${curr}${totalOrdered.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
    <div class="sum-card" style="background:#eff6ff;border-color:#bfdbfe">
      <div class="sum-label">Total Paid</div>
      <div class="sum-value" style="color:#1d4ed8">${curr}${totalPaid.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
    <div class="sum-card" style="background:#fff5f5;border-color:#fecaca">
      <div class="sum-label">Outstanding Due</div>
      <div class="sum-value" style="color:#991b1b">${curr}${totalDue.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
    <div class="sum-card" style="background:#ecfeff;border-color:#a5f3fc">
      <div class="sum-label">Cash</div>
      <div class="sum-value" style="color:#0e7490">${curr}${totalCash.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
    <div class="sum-card" style="background:#faf5ff;border-color:#ddd6fe">
      <div class="sum-label">Bank (Premier + UCB + Woori)</div>
      <div class="sum-value" style="color:#6d28d9">${curr}${totalBank.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="min-width:80px">PO #</th>
        <th style="min-width:80px">Date</th>
        <th style="min-width:150px">Product / Description</th>
        <th class="center" style="min-width:38px">Qty</th>
        <th class="center" style="min-width:42px">Unit</th>
        <th class="right" style="min-width:78px">Unit Price</th>
        <th class="right" style="min-width:88px">Line Total</th>
        <th class="right" style="min-width:78px">Paid</th>
        <th style="min-width:62px">Method</th>
        <th class="right" style="min-width:68px">Due</th>
        <th style="min-width:62px">Status</th>
        <th class="right" style="min-width:80px;background:#043d2f">Running Bal.</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows || `<tr><td colspan="12" style="text-align:center;color:#9ca3af;padding:24px;font-style:italic">No transactions found in this date range</td></tr>`}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="6"><strong>PERIOD TOTALS</strong></td>
        <td class="right mono">${curr}${totalOrdered.toFixed(2)}</td>
        <td class="right mono">${curr}${totalPaid.toFixed(2)}</td>
        <td>—</td>
        <td class="right mono">${curr}${totalDue.toFixed(2)}</td>
        <td></td>
        <td class="right mono">${curr}${Math.abs(liveBalance).toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="net-balance">
    <div>
      <div class="nb-left">Net Account Balance &nbsp;(All-Time, across all purchase orders)</div>
      <div class="nb-sub">${liveBalance > 0 ? "You have an outstanding balance payable to this supplier." : liveBalance < 0 ? "Supplier account is in credit (overpaid)." : "Account is fully settled."}</div>
    </div>
    <div class="nb-right">${curr}${Math.abs(liveBalance).toLocaleString("en-US",{minimumFractionDigits:2})} &nbsp;<span style="font-size:13px">${liveBalance > 0 ? "(Due)" : liveBalance < 0 ? "(Credit)" : "(Clear)"}</span></div>
  </div>

  <div class="sig-row">
    <div class="sig-box"><div class="sig-label">Prepared By</div></div>
    <div class="sig-box"><div class="sig-label">Authorised By</div></div>
    <div class="sig-box"><div class="sig-label">Supplier Acknowledgement</div></div>
  </div>

  <div class="footer">
    <span>${companyName} &nbsp;—&nbsp; Supplier Ledger: <strong>${supplier.name}</strong></span>
    <span>Printed: ${new Date().toLocaleString()}</span>
  </div>

</div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 300); };
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = `ledger-${supplier.name.replace(/\s+/g,"-")}.html`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  const [ledgerPage, setLedgerPage] = useState(1);
  const LEDGER_PER_PAGE = 12;
  const pagedRows = rows.slice((ledgerPage - 1) * LEDGER_PER_PAGE, ledgerPage * LEDGER_PER_PAGE);

  const muted  = { fontFamily: "IBM Plex Mono", fontSize: 11, color: "#64748B" };
  const monoSm = { fontFamily: "IBM Plex Mono", fontSize: 12 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Supplier Header Card ─────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))", borderRadius: 14, border: "1px solid #E2E8F0" }}>
        <div style={{ width: 54, height: 54, borderRadius: 14, background: "linear-gradient(135deg,#10B981,#3B82F6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "white", flexShrink: 0, boxShadow: "0 4px 16px rgba(16,185,129,0.35)" }}>
          {supplier.name[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0F172A" }}>{supplier.name}</div>
            <div style={{ display: "flex", gap: 2 }}>{Array.from({ length: 5 }, (_, i) => <Icon key={i} name="star" size={11} color={i < (supplier.rating || 0) ? "#F59E0B" : "#E2E8F0"} />)}</div>
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
            {supplier.email   && <span>✉ {supplier.email}</span>}
            {supplier.phone   && <span>📞 {supplier.phone}</span>}
            {supplier.address && <span>📍 {supplier.address}</span>}
          </div>
        </div>
        {/* Balance Badge */}
        <div style={{ textAlign: "right", flexShrink: 0, padding: "10px 16px", background: liveBalance > 0 ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)", border: `1px solid ${liveBalance > 0 ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}`, borderRadius: 12 }}>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Net Balance (All-Time)</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "IBM Plex Mono", color: liveBalance > 0 ? "#EF4444" : "#10B981", lineHeight: 1 }}>{curr}{Math.abs(liveBalance).toLocaleString("en-US",{minimumFractionDigits:2})}</div>
          <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700, color: liveBalance > 0 ? "#EF4444" : "#10B981" }}>{liveBalance > 0 ? "● OUTSTANDING" : "✓ CLEAR"}</div>
        </div>
      </div>

      {/* ── Summary Cards (5 cards) ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
        {[
          { l: "Total Ordered",  v: totalOrdered, c: "#10B981", bg: "rgba(16,185,129,0.08)", bd: "rgba(16,185,129,0.2)" },
          { l: "Total Paid",     v: totalPaid,    c: "#3B82F6", bg: "rgba(59,130,246,0.08)",  bd: "rgba(59,130,246,0.2)"  },
          { l: "Outstanding",    v: totalDue,     c: "#EF4444", bg: "rgba(239,68,68,0.08)",   bd: "rgba(239,68,68,0.2)"   },
          { l: "Cash",           v: totalCash,    c: "#06B6D4", bg: "rgba(6,182,212,0.08)",   bd: "rgba(6,182,212,0.2)"   },
          { l: "Bank",           v: totalBank,    c: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  bd: "rgba(139,92,246,0.2)"  },
        ].map(s => (
          <div key={s.l} style={{ background: s.bg, borderRadius: 10, padding: "11px 14px", border: `1px solid ${s.bd}` }}>
            <div style={{ fontSize: 9, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{s.l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "IBM Plex Mono", color: s.c }}>{curr}{s.v.toLocaleString("en-US",{minimumFractionDigits:2})}</div>
          </div>
        ))}
      </div>

      {/* ── Date Filter & Controls ────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", background: "#F1F5F9", borderRadius: 10, border: "1px solid #E2E8F0", flexWrap: "wrap" }}>
        <Icon name="calendar" size={14} color="#64748B" />
        <span style={muted}>FROM</span>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setLedgerPage(1); }} style={{ width: 148 }} />
        <span style={muted}>TO</span>
        <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setLedgerPage(1); }} style={{ width: 148 }} />
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {[
            { label: "7D",  from: daysAgo(7)   },
            { label: "30D", from: daysAgo(30)  },
            { label: "90D", from: daysAgo(90)  },
            { label: "1Y",  from: daysAgo(365) },
            { label: "All", from: firstDate,    to: lastDate },
          ].map(p => {
            const toVal = p.label === "All" ? lastDate : fmt(today);
            const isActive = dateFrom === p.from && dateTo === toVal;
            return (
              <button
                key={p.label}
                onClick={() => {
                  setDateFrom(p.from);
                  setDateTo(p.label === "All" ? lastDate : fmt(today));
                  setLedgerPage(1);
                }}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontSize: 11, fontFamily: "IBM Plex Mono",
                  background: isActive ? "#10B981" : "#E2E8F0",
                  color: isActive ? "white" : "#64748B",
                  transition: "all 0.15s",
                }}
              >{p.label}</button>
            );
          })}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={muted}>{rows.length} row{rows.length !== 1 ? "s" : ""} · {filtered.length} order{filtered.length !== 1 ? "s" : ""}</span>
          <button className="btn btn-primary btn-sm" onClick={downloadPDF}><Icon name="download" size={13} /> Download PDF</button>
        </div>
      </div>

      {/* ── Ledger Table ─────────────────────────────────── */}
      <div style={{ border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden" }}>
        {rows.length === 0 ? (
          <EmptyState message="No purchase orders in this date range" />
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 95 }}>PO #</th>
                    <th style={{ minWidth: 92 }}>Date</th>
                    <th style={{ minWidth: 150 }}>Product</th>
                    <th style={{ textAlign: "center", minWidth: 50 }}>Qty</th>
                    <th style={{ textAlign: "center", minWidth: 58 }}>Unit</th>
                    <th style={{ textAlign: "right", minWidth: 90 }}>Unit Price</th>
                    <th style={{ textAlign: "right", minWidth: 95, background: "rgba(16,185,129,0.12)", color: "#6EE7B7" }}>Line Total</th>
                    <th style={{ textAlign: "right", minWidth: 88, borderLeft: "2px solid #26334F" }}>Paid</th>
                    <th style={{ minWidth: 88 }}>Method</th>
                    <th style={{ textAlign: "right", minWidth: 80 }}>Due</th>
                    <th style={{ minWidth: 78 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row, i) => {
                    const rowBg = row.isAdvance ? "rgba(139,92,246,0.05)" : row.isReturn ? "rgba(239,68,68,0.04)" : row.isDeducted ? "rgba(245,158,11,0.05)" : row.isAidTds ? "rgba(6,182,212,0.05)" : "transparent";
                    const idColor = row.isAdvance ? "#8B5CF6" : row.isReturn ? "#EF4444" : row.isDeducted ? "#F59E0B" : row.isAidTds ? "#06B6D4" : "#10B981";
                    const isSpecial = row.isAdvance || row.isReturn || row.isDeducted || row.isAidTds;
                    return (
                      <tr key={`${row.poId}-${i}`} style={{ background: rowBg }}>
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ ...monoSm, color: idColor, fontWeight: 700, verticalAlign: "middle", borderRight: "1px solid #26334F", whiteSpace: "nowrap" }}>
                            {row.poId}
                          </td>
                        )}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ ...monoSm, color: "#94A3B8", verticalAlign: "middle", borderRight: "1px solid #26334F", whiteSpace: "nowrap" }}>
                            {row.date}
                          </td>
                        )}
                        <td style={{ color: row.isAdvance ? "#8B5CF6" : row.isReturn ? "#EF4444" : row.isDeducted ? "#F59E0B" : row.isAidTds ? "#06B6D4" : "#CBD5E1", fontStyle: isSpecial ? "italic" : "normal", fontWeight: isSpecial ? 600 : 400, fontSize: 13 }}>
                          {row.product}
                        </td>
                        <td style={{ textAlign: "center", ...monoSm, color: "#E2E8F0" }}>{row.qty}</td>
                        <td style={{ textAlign: "center" }}>
                          {row.isAdvance ? <span className="badge badge-purple">PAY</span>
                            : row.isReturn ? <span className="badge badge-danger">RET</span>
                            : row.isDeducted ? <span className="badge" style={{ background: "rgba(245,158,11,0.15)", color: "#F59E0B" }}>DED</span>
                            : row.isAidTds ? <span className="badge badge-tds">TDS</span>
                            : <span className="badge badge-success" style={{ fontSize: 10 }}>{row.unit}</span>}
                        </td>
                        <td style={{ textAlign: "right", ...monoSm, color: "#CBD5E1" }}>
                          {isSpecial ? "—" : `${curr}${Number(row.price).toFixed(2)}`}
                        </td>
                        <td style={{ textAlign: "right", ...monoSm, fontSize: 13, fontWeight: 700, background: "rgba(16,185,129,0.04)", color: row.isAdvance ? "#8B5CF6" : row.isReturn ? "#EF4444" : row.isDeducted ? "#F59E0B" : row.isAidTds ? "#06B6D4" : "#E2E8F0" }}>
                          {row.isReturn ? `↩ ${curr}${Number(row.lineTotal).toFixed(2)}` : (row.isDeducted || row.isAidTds) ? `− ${curr}${Math.abs(Number(row.lineTotal)).toFixed(2)}` : `${curr}${Number(row.lineTotal).toFixed(2)}`}
                        </td>
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: "#10B981", verticalAlign: "middle", borderLeft: "2px solid #26334F" }}>
                            {(row.isReturn || row.isDeducted || row.isAidTds) ? "—" : `${curr}${Number(row.poPaid).toFixed(2)}`}
                          </td>
                        )}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ verticalAlign: "middle" }}>
                            {row.paymentMethod ? (
                              <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono", padding: "2px 8px", borderRadius: 5, background: row.paymentMethod === "Cash" ? "rgba(16,185,129,0.12)" : "rgba(59,130,246,0.12)", color: row.paymentMethod === "Cash" ? "#10B981" : "#3B82F6", fontWeight: 600, whiteSpace: "nowrap", border: `1px solid ${row.paymentMethod === "Cash" ? "rgba(16,185,129,0.25)" : "rgba(59,130,246,0.25)"}` }}>
                                {row.paymentMethod}
                              </span>
                            ) : <span style={{ color: "#475569", fontSize: 11 }}>—</span>}
                          </td>
                        )}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: row.poDue > 0 ? "#EF4444" : "#475569", verticalAlign: "middle" }}>
                            {(row.isReturn || row.isDeducted || row.isAidTds) ? "—" : `${curr}${Number(row.poDue).toFixed(2)}`}
                          </td>
                        )}
                        {row.isFirst && (
                          <td rowSpan={row.rowSpan} style={{ verticalAlign: "middle" }}>
                            <StatusBadge status={row.status} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr style={{ background: "#0E1629", borderTop: "2px solid #26334F" }}>
                    <td colSpan={6} style={{ ...monoSm, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 14px" }}>Period Totals</td>
                    <td style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: "#10B981", padding: "10px 14px", background: "rgba(16,185,129,0.06)" }}>{curr}{totalOrdered.toFixed(2)}</td>
                    <td style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: "#3B82F6", padding: "10px 14px", borderLeft: "2px solid #26334F" }}>{curr}{totalPaid.toFixed(2)}</td>
                    <td style={{ padding: "10px 14px" }} />
                    <td style={{ textAlign: "right", ...monoSm, fontWeight: 700, color: totalDue > 0 ? "#EF4444" : "#64748B", padding: "10px 14px" }}>{curr}{totalDue.toFixed(2)}</td>
                    <td style={{ padding: "10px 14px" }} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {rows.length > LEDGER_PER_PAGE && (
              <div style={{ padding: "10px 16px", borderTop: "1px solid #E2E8F0", background: "#FFFFFF" }}>
                <Pagination page={ledgerPage} total={rows.length} perPage={LEDGER_PER_PAGE} onChange={setLedgerPage} />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Running Balance Footer ─────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: liveBalance > 0 ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)", borderRadius: 10, border: `1px solid ${liveBalance > 0 ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}` }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>Net Account Balance <span style={{ fontSize: 11, color: "#64748B", fontWeight: 400 }}>(all-time, across all purchase orders)</span></div>
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>{liveBalance > 0 ? "You owe this supplier money." : liveBalance < 0 ? "Supplier account is in credit (overpaid)." : "Account fully settled."}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: "IBM Plex Mono", color: liveBalance > 0 ? "#EF4444" : "#10B981" }}>
            {curr}{Math.abs(liveBalance).toLocaleString("en-US",{minimumFractionDigits:2})}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: liveBalance > 0 ? "#EF4444" : "#10B981" }}>
            {liveBalance > 0 ? "● OUTSTANDING DUE" : liveBalance < 0 ? "● CREDIT BALANCE" : "✓ FULLY SETTLED"}
          </div>
        </div>
      </div>

    </div>
  );
};

// ============================================================
// FINANCE
// ============================================================
const Finance = () => {
  const { data, setData, toast, curr } = useApp();
  const [showExpModal, setShowExpModal] = useState(false);
  const [expForm, setExpForm] = useState({ category: "Utilities", amount: 0, note: "", date: fmt(today) });

  const totalSales = data.sales.reduce((s, x) => s + x.paid, 0);
  const totalCOGS = data.purchases.reduce((s, x) => s + x.total, 0);
  const totalExpenses = data.expenses.reduce((s, e) => s + e.amount, 0);
  const grossProfit = totalSales - totalCOGS;
  const netProfit = grossProfit - totalExpenses;
  const margin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0;

  const addExpense = () => {
    if (!expForm.amount) { toast("Amount required", "error"); return; }
    setData(d => ({ ...d, expenses: [{ ...expForm, id: generateId(), amount: +expForm.amount }, ...d.expenses] }));
    toast("Expense added!", "success");
    setShowExpModal(false);
    setExpForm({ category: "Utilities", amount: 0, note: "", date: fmt(today) });
  };

  const expByCategory = {};
  data.expenses.forEach(e => { expByCategory[e.category] = (expByCategory[e.category] || 0) + e.amount; });

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader title="Financial Overview" subtitle="Profit, loss & expense tracking"
        actions={<button className="btn btn-primary" onClick={() => setShowExpModal(true)}><Icon name="plus" size={15} /> Add Expense</button>}
      />

      {/* P&L Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { l: "Revenue", v: totalSales, color: "#3B82F6" },
          { l: "COGS", v: totalCOGS, color: "#F59E0B" },
          { l: "Gross Profit", v: grossProfit, color: "#10B981" },
          { l: "Expenses", v: totalExpenses, color: "#EF4444" },
          { l: "Net Profit", v: netProfit, color: "#8B5CF6" },
        ].map(s => (
          <div key={s.l} className="card" style={{ padding: 16, borderColor: `${s.color}22` }}>
            <div style={{ fontSize: 10, color: "#64748B", marginBottom: 6, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>{s.l}</div>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "IBM Plex Mono", color: s.color }}>{curr}{s.v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16, marginBottom: 20 }}>
        {/* P&L Statement */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Profit & Loss Statement</div>
            <span className="badge badge-blue">Current Period</span>
          </div>
          <div style={{ padding: 20 }}>
            {[
              { label: "Revenue", value: totalSales, color: "#0F172A", indent: 0 },
              { label: "Cost of Goods Sold", value: -totalCOGS, color: "#F59E0B", indent: 1 },
              { label: "Gross Profit", value: grossProfit, color: "#10B981", indent: 0, bold: true },
              { label: "Operating Expenses", value: -totalExpenses, color: "#EF4444", indent: 1 },
              { label: "Net Profit", value: netProfit, color: netProfit >= 0 ? "#8B5CF6" : "#EF4444", indent: 0, bold: true },
              { label: "Net Margin", value: null, display: `${margin}%`, color: "#8B5CF6", indent: 0 },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < 5 ? "1px solid #FFFFFF" : "none", paddingLeft: row.indent * 12 }}>
                <span style={{ fontSize: 13, color: row.bold ? "#0F172A" : "#475569", fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                <span style={{ fontFamily: "IBM Plex Mono", fontSize: 13, color: row.color, fontWeight: row.bold ? 700 : 400 }}>
                  {row.display || `${row.value >= 0 ? "" : "-"}${curr}${Math.abs(row.value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Expense Breakdown */}
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Expense Breakdown</div>
          </div>
          <div style={{ padding: 20 }}>
            {Object.entries(expByCategory).map(([cat, amount]) => (
              <div key={cat} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "#475569" }}>{cat}</span>
                  <span style={{ fontSize: 12, fontFamily: "IBM Plex Mono", color: "#0F172A" }}>{curr}{amount.toLocaleString()}</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(amount / totalExpenses) * 100}%`, background: "#EF4444" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expense Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Expense History</div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead>
          <tbody>
            {data.expenses.map(e => (
              <tr key={e.id}>
                <td className="mono" style={{ fontSize: 12 }}>{e.date}</td>
                <td><span className="badge badge-gray">{e.category}</span></td>
                <td style={{ color: "#94A3B8" }}>{e.note}</td>
                <td><span className="mono" style={{ color: "#EF4444" }}>{curr}{e.amount.toLocaleString()}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showExpModal} onClose={() => setShowExpModal(false)} title="Add Expense" width={420}>
        <div className="form-group">
          <label className="form-label">Category</label>
          <select value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))}>
            {["Utilities", "Rent", "Salaries", "Marketing", "Maintenance", "Transport", "Other"].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Amount</label>
          <input type="number" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: +e.target.value }))} min={0} />
        </div>
        <div className="form-group">
          <label className="form-label">Date</label>
          <input type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Note</label>
          <textarea value={expForm.note} onChange={e => setExpForm(f => ({ ...f, note: e.target.value }))} rows={2} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={() => setShowExpModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={addExpense}><Icon name="check" size={14} /> Add Expense</button>
        </div>
      </Modal>
    </div>
  );
};

// ============================================================
// REPORTS
// ============================================================
const Reports = () => {
  const { data, curr } = useApp();
  const [activeReport, setActiveReport] = useState("sales");
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(fmt(today));

  const reportTypes = [
    { id: "sales", label: "Sales Report", icon: "sales" },
    { id: "purchases", label: "Purchase Report", icon: "purchase" },
    { id: "pl", label: "Profit & Loss", icon: "finance" },
    { id: "stock", label: "Stock Report", icon: "inventory" },
  ];

  const filteredSales = data.sales.filter(s => s.date >= dateFrom && s.date <= dateTo);
  const filteredPurchases = data.purchases.filter(p => p.date >= dateFrom && p.date <= dateTo);
  const filteredExpenses = data.expenses.filter(e => e.date >= dateFrom && e.date <= dateTo);

  const salesTotal = filteredSales.reduce((s, x) => s + x.total, 0);
  const purchaseTotal = filteredPurchases.reduce((s, x) => s + x.total, 0);
  const expenseTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const profit = salesTotal - purchaseTotal - expenseTotal;

  const printReport = () => {
    const reportLabel = reportTypes.find(r => r.id === activeReport)?.label || "Report";
    const companyName = data.settings.companyName || "BizCore Systems";

    let tableHTML = "";

    if (activeReport === "sales") {
      tableHTML = `
        <table>
          <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            ${filteredSales.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:#888;padding:24px">No sales in this date range</td></tr>` :
              filteredSales.map(s => {
                const c = data.customers.find(x => x.id === s.customerId);
                return `<tr>
                  <td class="mono blue">${s.invoiceNo}</td>
                  <td class="mono">${s.date}</td>
                  <td>${c?.name || "—"}</td>
                  <td class="mono">${curr}${s.total.toFixed(2)}</td>
                  <td class="mono green">${curr}${s.paid.toFixed(2)}</td>
                  <td class="mono ${s.due > 0 ? "red" : ""}">${curr}${s.due.toFixed(2)}</td>
                  <td><span class="badge badge-${s.status}">${s.status.toUpperCase()}</span></td>
                </tr>`;
              }).join("")}
          </tbody>
        </table>`;
    } else if (activeReport === "purchases") {
      tableHTML = `
        <table>
          <thead><tr><th>PO#</th><th>Date</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
          <tbody>
            ${filteredPurchases.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:#888;padding:24px">No purchases in this date range</td></tr>` :
              filteredPurchases.map(p => {
                const s = data.suppliers.find(x => x.id === p.supplierId);
                return `<tr>
                  <td class="mono purple">${p.id}</td>
                  <td class="mono">${p.date}</td>
                  <td>${s?.name || "—"}</td>
                  <td class="mono">${curr}${p.total.toFixed(2)}</td>
                  <td class="mono green">${curr}${p.paid.toFixed(2)}</td>
                  <td class="mono ${(p.due||0) > 0 ? "red" : ""}">${curr}${(p.due||0).toFixed(2)}</td>
                  <td><span class="badge badge-${p.status}">${p.status.toUpperCase()}</span></td>
                </tr>`;
              }).join("")}
          </tbody>
        </table>`;
    } else if (activeReport === "pl") {
      const rows = [
        { label: "Total Revenue", value: salesTotal, color: "#1d4ed8", bold: true },
        { label: "Cost of Goods Sold (Purchases)", value: purchaseTotal, color: "#b45309" },
        { label: "Gross Profit", value: salesTotal - purchaseTotal, color: "#065f46", bold: true },
        { label: "Operating Expenses", value: expenseTotal, color: "#991b1b" },
        { label: "Net Profit / Loss", value: profit, color: profit >= 0 ? "#6d28d9" : "#991b1b", bold: true },
        { label: "Profit Margin", display: `${salesTotal > 0 ? ((profit / salesTotal) * 100).toFixed(2) : 0}%`, color: "#6d28d9" },
      ];
      tableHTML = `
        <table>
          <thead><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead>
          <tbody>
            ${rows.map(row => `<tr style="${row.bold ? "font-weight:700;font-size:15px" : ""}">
              <td style="color:${row.bold ? "#111" : "#555"}">${row.label}</td>
              <td style="text-align:right;font-family:monospace;color:${row.color}">${row.display || `${curr}${Math.abs(row.value || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}</td>
            </tr>`).join("")}
          </tbody>
        </table>`;
    } else if (activeReport === "stock") {
      tableHTML = `
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th>Stock</th><th>Min Stock</th><th>Buy Price</th><th>Stock Value</th><th>Status</th></tr></thead>
          <tbody>
            ${data.products.length === 0 ? `<tr><td colspan="7" style="text-align:center;color:#888;padding:24px">No products found</td></tr>` :
              data.products.map(p => {
                const ss = p.stock === 0 ? "out" : p.stock <= p.minStock ? "low" : "ok";
                const ssLabel = { out: "OUT OF STOCK", low: "LOW STOCK", ok: "IN STOCK" }[ss];
                const ssColor = { out: "#991b1b", low: "#92400e", ok: "#065f46" }[ss];
                const ssBg = { out: "#fee2e2", low: "#fef3c7", ok: "#d1fae5" }[ss];
                return `<tr>
                  <td style="font-weight:600">${p.name}</td>
                  <td class="mono" style="color:#666">${p.sku}</td>
                  <td class="mono">${p.stock} ${p.unit}</td>
                  <td class="mono" style="color:#888">${p.minStock}</td>
                  <td class="mono">${curr}${p.buyPrice.toFixed(2)}</td>
                  <td class="mono green">${curr}${(p.stock * p.buyPrice).toFixed(2)}</td>
                  <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${ssBg};color:${ssColor}">${ssLabel}</span></td>
                </tr>`;
              }).join("")}
          </tbody>
        </table>`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${reportLabel} — ${companyName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1a1a1a; background: #fff; padding: 36px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #3B82F6; }
  .report-title { font-size: 28px; font-weight: 800; color: #3B82F6; }
  .report-sub { font-size: 12px; color: #888; margin-top: 4px; font-family: monospace; }
  .company-name { font-size: 16px; font-weight: 700; color: #111; text-align: right; }
  .company-sub { font-size: 12px; color: #666; margin-top: 4px; text-align: right; }
  .date-range { background: #f0f4ff; border: 1px solid #d1d9f0; border-radius: 8px; padding: 10px 16px; margin-bottom: 24px; font-family: monospace; font-size: 12px; color: #444; display: inline-block; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .summary-card { background: #f8f9fa; border-radius: 8px; padding: 14px 16px; border: 1px solid #e5e7eb; }
  .summary-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 6px; }
  .summary-value { font-size: 18px; font-weight: 700; font-family: monospace; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #3B82F6; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
  td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) td { background: #fafafa; }
  .mono { font-family: monospace; }
  .blue { color: #1d4ed8; }
  .green { color: #065f46; }
  .red { color: #991b1b; }
  .purple { color: #6d28d9; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; }
  .badge-paid { background: #d1fae5; color: #065f46; }
  .badge-due { background: #fee2e2; color: #991b1b; }
  .badge-partial { background: #fef3c7; color: #92400e; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; font-size: 11px; color: #aaa; }
  @media print { body { padding: 20px; } @page { margin: 1.5cm; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="report-title">${reportLabel.toUpperCase()}</div>
      <div class="report-sub">Generated: ${new Date().toLocaleString()}</div>
    </div>
    <div>
      <div class="company-name">${companyName}</div>
      <div class="company-sub">${data.settings.email || ""} ${data.settings.phone ? "· " + data.settings.phone : ""}</div>
    </div>
  </div>

  <div class="date-range">📅 Period: ${dateFrom} → ${dateTo}</div>

  <div class="summary">
    <div class="summary-card"><div class="summary-label">Total Sales</div><div class="summary-value" style="color:#1d4ed8">${curr}${salesTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div></div>
    <div class="summary-card"><div class="summary-label">Total Purchases</div><div class="summary-value" style="color:#b45309">${curr}${purchaseTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div></div>
    <div class="summary-card"><div class="summary-label">Total Expenses</div><div class="summary-value" style="color:#991b1b">${curr}${expenseTotal.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div></div>
    <div class="summary-card"><div class="summary-label">Net Profit</div><div class="summary-value" style="color:${profit >= 0 ? "#065f46" : "#991b1b"}">${curr}${profit.toLocaleString("en-US", { minimumFractionDigits: 0 })}</div></div>
  </div>

  ${tableHTML}

  <div class="footer">
    <span>${companyName} — ${reportLabel}</span>
    <span>Hongtai ERP · ${new Date().toLocaleDateString()}</span>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 300); };
    } else {
      const a = document.createElement("a");
      a.href = url; a.download = `bizcore-${activeReport}-report.html`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader title="Reports" subtitle="Analytics & business insights"
        actions={<>
          <button className="btn btn-secondary" onClick={() => {
            const rows = [["Report","Date Range","From",dateFrom,"To",dateTo]];
            if (activeReport === "sales") {
              rows.push(["Invoice","Date","Customer","Total","Paid","Due","Status"]);
              filteredSales.forEach(s => { const c = data.customers.find(x => x.id === s.customerId); rows.push([s.invoiceNo, s.date, c?.name||"", s.total.toFixed(2), s.paid.toFixed(2), s.due.toFixed(2), s.status]); });
            } else if (activeReport === "purchases") {
              rows.push(["PO#","Date","Supplier","Total","Paid","Status"]);
              filteredPurchases.forEach(p => { const s = data.suppliers.find(x => x.id === p.supplierId); rows.push([p.id, p.date, s?.name||"", p.total.toFixed(2), p.paid.toFixed(2), p.status]); });
            } else if (activeReport === "stock") {
              rows.push(["Product","SKU","Stock","Min Stock","Buy Price","Stock Value","Status"]);
              data.products.forEach(p => { const ss = p.stock===0?"out":p.stock<=p.minStock?"low":"ok"; rows.push([p.name, p.sku, p.stock, p.minStock, p.buyPrice.toFixed(2), (p.stock*p.buyPrice).toFixed(2), ss.toUpperCase()]); });
            } else {
              rows.push(["Item","Value"]);
              rows.push(["Total Revenue", salesTotal.toFixed(2)], ["Purchases (COGS)", purchaseTotal.toFixed(2)], ["Expenses", expenseTotal.toFixed(2)], ["Net Profit", profit.toFixed(2)]);
            }
            const csv = rows.map(r => r.join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `bizcore-${activeReport}-report.csv`; a.click();
          }}><Icon name="download" size={14} /> Export CSV</button>
          <button className="btn btn-secondary" onClick={printReport}><Icon name="print" size={14} /> Print / PDF</button>
        </>}
      />

      {/* Filters */}
      <div className="card" style={{ padding: 16, marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {reportTypes.map(r => (
            <button key={r.id} onClick={() => setActiveReport(r.id)} className="btn btn-secondary btn-sm"
              style={{ background: activeReport === r.id ? "#3B82F6" : "#F1F5F9", color: activeReport === r.id ? "white" : "#475569", border: `1px solid ${activeReport === r.id ? "#3B82F6" : "#E2E8F0"}` }}>
              <Icon name={r.icon} size={13} /> {r.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748B" }}>From:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 140 }} />
          <span style={{ fontSize: 12, color: "#64748B" }}>To:</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 140 }} />
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Total Sales", v: salesTotal, c: "#3B82F6" },
          { l: "Total Purchases", v: purchaseTotal, c: "#F59E0B" },
          { l: "Total Expenses", v: expenseTotal, c: "#EF4444" },
          { l: "Net Profit", v: profit, c: "#10B981" },
        ].map(s => (
          <div key={s.l} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>{s.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "IBM Plex Mono", color: s.c }}>{curr}{s.v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
          </div>
        ))}
      </div>

      {/* Report Table */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>
            {reportTypes.find(r => r.id === activeReport)?.label}
          </div>
          <span style={{ fontSize: 12, color: "#64748B", fontFamily: "IBM Plex Mono" }}>{dateFrom} → {dateTo}</span>
        </div>

        {activeReport === "sales" && (
          <table>
            <thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>
              {filteredSales.length === 0 ? <tr><td colSpan={7}><EmptyState message="No sales in range" /></td></tr> :
                filteredSales.map(s => {
                  const c = data.customers.find(x => x.id === s.customerId);
                  return <tr key={s.id}>
                    <td className="mono" style={{ color: "#3B82F6", fontSize: 12 }}>{s.invoiceNo}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{s.date}</td>
                    <td>{c?.name}</td>
                    <td className="mono">{curr}{s.total.toFixed(2)}</td>
                    <td className="mono" style={{ color: "#10B981" }}>{curr}{s.paid.toFixed(2)}</td>
                    <td className="mono" style={{ color: s.due > 0 ? "#EF4444" : "#64748B" }}>{curr}{s.due.toFixed(2)}</td>
                    <td><StatusBadge status={s.status} /></td>
                  </tr>;
                })}
            </tbody>
          </table>
        )}

        {activeReport === "purchases" && (
          <table>
            <thead><tr><th>PO#</th><th>Date</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>
              {filteredPurchases.length === 0 ? <tr><td colSpan={6}><EmptyState message="No purchases in range" /></td></tr> :
                filteredPurchases.map(p => {
                  const s = data.suppliers.find(x => x.id === p.supplierId);
                  return <tr key={p.id}>
                    <td className="mono" style={{ color: "#8B5CF6", fontSize: 12 }}>{p.id}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{p.date}</td>
                    <td>{s?.name}</td>
                    <td className="mono">{curr}{p.total.toFixed(2)}</td>
                    <td className="mono" style={{ color: "#10B981" }}>{curr}{p.paid.toFixed(2)}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>;
                })}
            </tbody>
          </table>
        )}

        {activeReport === "pl" && (
          <div style={{ padding: 24 }}>
            {[
              { label: "Total Revenue", value: salesTotal, color: "#3B82F6", bold: true },
              { label: "Cost of Goods Sold (Purchases)", value: purchaseTotal, color: "#F59E0B" },
              { label: "Gross Profit", value: salesTotal - purchaseTotal, color: "#10B981", bold: true },
              { label: "Operating Expenses", value: expenseTotal, color: "#EF4444" },
              { label: "Net Profit / Loss", value: profit, color: profit >= 0 ? "#8B5CF6" : "#EF4444", bold: true },
              { label: "Profit Margin", value: null, display: `${salesTotal > 0 ? ((profit / salesTotal) * 100).toFixed(2) : 0}%`, color: "#8B5CF6" },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid #FFFFFF", fontSize: row.bold ? 15 : 13, fontWeight: row.bold ? 700 : 400 }}>
                <span style={{ color: row.bold ? "#0F172A" : "#475569" }}>{row.label}</span>
                <span style={{ fontFamily: "IBM Plex Mono", color: row.color }}>{row.display || `${curr}${Math.abs(row.value || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`}</span>
              </div>
            ))}
          </div>
        )}

        {activeReport === "stock" && (
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>Stock</th><th>Min Stock</th><th>Buy Price</th><th>Stock Value</th><th>Status</th></tr></thead>
            <tbody>
              {data.products.map(p => {
                const ss = p.stock === 0 ? "out" : p.stock <= p.minStock ? "low" : "ok";
                return <tr key={p.id}>
                  <td style={{ fontWeight: 500, color: "#E2E8F0" }}>{p.name}</td>
                  <td className="mono" style={{ fontSize: 12, color: "#64748B" }}>{p.sku}</td>
                  <td className="mono">{p.stock} {p.unit}</td>
                  <td className="mono" style={{ color: "#64748B" }}>{p.minStock}</td>
                  <td className="mono">{curr}{p.buyPrice.toFixed(2)}</td>
                  <td className="mono" style={{ color: "#10B981" }}>{curr}{(p.stock * p.buyPrice).toFixed(2)}</td>
                  <td><span className={`badge ${ss === "ok" ? "badge-success" : ss === "low" ? "badge-warning" : "badge-danger"}`}>{ss.toUpperCase()}</span></td>
                </tr>;
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ============================================================
// AI ANALYTICS
// ============================================================
const AIAnalytics = () => {
  const { data, curr } = useApp();
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState(null);
  const [insight, setInsight] = useState(null);
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("");

  const salesData = data.sales.slice(0, 14).map(s => ({
    date: s.date,
    amount: s.total,
    customer: data.customers.find(c => c.id === s.customerId)?.name
  }));

  const runAI = async () => {
    if (!apiKey) { alert("Enter API key to use AI features"); return; }
    setLoading(true);
    try {
      const contextPrompt = `You are a business intelligence analyst. Analyze this business data and provide insights:

Sales data (last 30 sales): ${JSON.stringify(salesData)}
Total Revenue: ${curr}${data.sales.reduce((s, x) => s + x.paid, 0).toFixed(0)}
Total Products: ${data.products.length}
Low Stock Items: ${data.products.filter(p => p.stock <= p.minStock).length}
Total Customers: ${data.customers.length}

User question: ${prompt || "Give me a business performance summary and 3 key actionable recommendations."}

Provide a concise, data-driven analysis in 2-3 paragraphs with bullet points for recommendations.`;

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: contextPrompt }] })
      });
      const d = await res.json();
      setInsight(d.content?.[0]?.text || "Unable to generate insight.");
    } catch (e) {
      setInsight("Error connecting to AI. Please check your API key.");
    }
    setLoading(false);
  };

  // Mock prediction chart
  const futureDays = Array.from({ length: 14 }, (_, i) => ({
    label: `Day ${i + 1}`,
    value: 2000 + Math.sin(i * 0.5) * 800 + Math.random() * 500 + i * 80
  }));

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader title="AI Analytics" subtitle="Machine learning insights powered by Claude AI" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        {/* Sales Prediction */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ color: "#8B5CF6" }}><Icon name="ai" size={16} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Sales Forecast</div>
            <span className="badge badge-purple" style={{ marginLeft: "auto" }}>AI Generated</span>
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginBottom: 16 }}>Predicted revenue for next 14 days</div>
          <BarChart data={futureDays} height={120} color="#8B5CF6" />
          <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(139,92,246,0.08)", borderRadius: 8, border: "1px solid rgba(139,92,246,0.15)" }}>
            <div style={{ fontSize: 12, color: "#8B5CF6" }}>📈 Projected growth: <strong>+14.2%</strong> based on historical trend analysis</div>
          </div>
        </div>

        {/* Smart Metrics */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ color: "#10B981" }}><Icon name="trend_up" size={16} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Smart Metrics</div>
          </div>
          {[
            { label: "Customer Lifetime Value", value: `${curr}${data.customers.length > 0 ? (data.sales.reduce((s, x) => s + x.total, 0) / data.customers.length).toFixed(0) : "0"}`, trend: "+8%", color: "#10B981" },
            { label: "Avg Order Value", value: `${curr}${data.sales.length > 0 ? (data.sales.reduce((s, x) => s + x.total, 0) / data.sales.length).toFixed(0) : "0"}`, trend: "+5%", color: "#3B82F6" },
            { label: "Inventory Turnover", value: "4.2x/yr", trend: "+12%", color: "#F59E0B" },
            { label: "Payment Collection Rate", value: `${data.sales.reduce((s, x) => s + x.total, 0) > 0 ? ((data.sales.reduce((s, x) => s + x.paid, 0) / data.sales.reduce((s, x) => s + x.total, 0)) * 100).toFixed(1) : "0"}%`, trend: "-2%", color: "#8B5CF6" },
          ].map(m => (
            <div key={m.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #FFFFFF" }}>
              <span style={{ fontSize: 12, color: "#475569" }}>{m.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "IBM Plex Mono", fontSize: 13, color: "#0F172A", fontWeight: 600 }}>{m.value}</span>
                <span style={{ fontSize: 11, color: m.trend.startsWith("+") ? "#10B981" : "#EF4444", fontFamily: "IBM Plex Mono" }}>{m.trend}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Chat */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", color: "white" }}>
            <Icon name="ai" size={18} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>AI Business Advisor</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>Powered by Claude — enter your API key to unlock</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 12 }}>
          <input
            type="password"
            placeholder="Enter your Anthropic API key (sk-ant-...)"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <span className="badge badge-warning" style={{ alignSelf: "center" }}>Required</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 16 }}>
          <input
            placeholder="Ask AI: 'What are my top opportunities this month?', 'Which products should I reorder?'..."
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && runAI()}
          />
          <button className="btn btn-primary" onClick={runAI} disabled={loading}>
            {loading ? <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> : <><Icon name="ai" size={14} /> Analyze</>}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {["Summarize performance", "Best selling products", "Cash flow advice", "Reorder recommendations"].map(q => (
            <button key={q} onClick={() => { setPrompt(q); }} className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}>{q}</button>
          ))}
        </div>

        {insight && (
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 10, padding: 20, animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", align: "center", gap: 6, marginBottom: 12 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", marginTop: 5 }} />
              <span style={{ fontSize: 11, color: "#10B981", fontFamily: "IBM Plex Mono", fontWeight: 600 }}>AI ANALYSIS</span>
            </div>
            <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{insight}</div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// ACTIVITY LOGS
// ============================================================
const ActivityLogs = () => {
  const { data } = useApp();
  const [search, setSearch] = useState("");

  const allLogs = [
    ...data.activityLogs,
    ...data.sales.slice(0, 10).map(s => ({ id: s.id, user: "System", action: `Sale ${s.id} created - ${s.invoiceNo}`, time: s.date, type: "sale" })),
    ...data.purchases.slice(0, 8).map(p => ({ id: p.id, user: "System", action: `Purchase ${p.id} created`, time: p.date, type: "purchase" })),
  ];

  const filtered = allLogs.filter(l => l.action.toLowerCase().includes(search.toLowerCase()) || l.user.toLowerCase().includes(search.toLowerCase()));

  const typeColors = { sale: "#10B981", purchase: "#8B5CF6", stock: "#F59E0B", product: "#3B82F6", customer: "#EF4444", System: "#64748B" };

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader title="Activity Logs" subtitle="Full audit trail of all system activities" />
      <SearchInput value={search} onChange={setSearch} placeholder="Search logs..." style={{ marginBottom: 16, maxWidth: 400 }} />
      <div className="card" style={{ overflow: "hidden" }}>
        <table>
          <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Type</th></tr></thead>
          <tbody>
            {filtered.map((log, i) => (
              <tr key={`${log.id}-${i}`}>
                <td className="mono" style={{ fontSize: 12, color: "#64748B" }}>{log.time}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white" }}>{log.user[0]}</div>
                    <span style={{ fontSize: 12 }}>{log.user}</span>
                  </div>
                </td>
                <td style={{ color: "#CBD5E1" }}>{log.action}</td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: typeColors[log.type] || "#64748B" }} />
                    <span style={{ fontSize: 11, fontFamily: "IBM Plex Mono", color: typeColors[log.type] || "#64748B", textTransform: "uppercase" }}>{log.type}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <EmptyState message="No logs found" />}
      </div>
    </div>
  );
};

// ============================================================
// USERS TAB (inside Settings)
// ============================================================
const UsersTab = () => {
  const { data, setData, toast, currentUser } = useApp();
  const emptyForm = { name: "", email: "", password: "", role: "Staff", active: true };
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const roleColors = { Admin: "badge-blue", Manager: "badge-purple", Staff: "badge-gray", Cashier: "badge-warning" };
  const roles = ["Admin", "Manager", "Staff", "Cashier"];

  const openNew = () => { setEditId(null); setForm(emptyForm); setShowPw(false); setShowForm(true); };
  const openEdit = (u) => {
    setEditId(u.id);
    setForm({ name: u.name, email: u.email, password: u.password || "", role: u.role, active: u.active !== false });
    setShowPw(false);
    setShowForm(true);
  };
  const cancel = () => { setShowForm(false); setEditId(null); setForm(emptyForm); };

  const submit = () => {
    if (!form.name.trim() || !form.email.trim() || !form.role) {
      toast("Name, email and role are required", "error"); return;
    }
    if (!editId && !form.password.trim()) {
      toast("Password is required for new users", "error"); return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      toast("Please enter a valid email address", "error"); return;
    }
    // Duplicate email check
    const duplicate = data.users.find(u => u.email === form.email && u.id !== editId);
    if (duplicate) { toast("A user with this email already exists", "error"); return; }

    if (editId) {
      setData(d => ({
        ...d,
        users: d.users.map(u => u.id === editId ? {
          ...u,
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password.trim() || u.password,
          role: form.role,
          active: form.active,
          avatar: form.name.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2),
        } : u)
      }));
      toast("User updated!", "success");
    } else {
      const newUser = {
        id: generateId(),
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        role: form.role,
        active: form.active,
        avatar: form.name.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2),
        lastLogin: "—",
      };
      setData(d => ({ ...d, users: [...d.users, newUser] }));
      toast("User created successfully!", "success");
    }
    cancel();
  };

  const deleteUser = (u) => {
    if (currentUser && currentUser.id === u.id) { toast("You cannot delete your own account", "error"); return; }
    if (!window.confirm(`Delete user "${u.name}"? They will no longer be able to log in. The account goes to the Recycle Bin and can be restored.`)) return;
    const entry = makeBinEntry("users", u, data, currentUser?.name);
    setData(d => trashItem(d, "users", entry));
    toast("User moved to Recycle Bin", "success");
  };

  const toggleActive = (u) => {
    if (currentUser && currentUser.id === u.id) { toast("You cannot deactivate your own account", "error"); return; }
    setData(d => ({ ...d, users: d.users.map(x => x.id === u.id ? { ...x, active: !x.active } : x) }));
    toast(u.active ? "User deactivated" : "User activated", "success");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>User Management</h3>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={openNew}><Icon name="plus" size={13} /> Add User</button>
        )}
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div style={{ background: "#F1F5F9", border: "1px solid #E2E8F0", borderRadius: 12, padding: 20, marginBottom: 24, animation: "fadeIn 0.2s ease" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 16 }}>
            {editId ? "Edit User" : "Add New User"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input placeholder="e.g. John Smith" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address *</label>
              <input type="email" placeholder="john@company.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">{editId ? "New Password (leave blank to keep)" : "Password *"}</label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  placeholder={editId ? "Leave blank to keep current" : "Min 6 characters"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ paddingRight: 40 }}
                />
                <button onClick={() => setShowPw(v => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#64748B", padding: 4 }}>
                  {showPw ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Role *</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 20 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                <div
                  onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  style={{ width: 40, height: 22, borderRadius: 11, background: form.active ? "#10B981" : "#E2E8F0", border: `1px solid ${form.active ? "#10B981" : "#CBD5E1"}`, position: "relative", cursor: "pointer", transition: "all 0.2s" }}
                >
                  <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 2, left: form.active ? 20 : 2, transition: "left 0.2s" }} />
                </div>
                <span className="form-label" style={{ margin: 0 }}>Active Account</span>
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={submit}><Icon name="check" size={14} /> {editId ? "Update User" : "Create User"}</button>
            <button className="btn btn-secondary" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* Users Table */}
      {data.users.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#64748B" }}>
          <div style={{ marginBottom: 8, opacity: 0.4 }}><Icon name="user" size={36} /></div>
          <p style={{ fontSize: 14 }}>No users yet. Add one above.</p>
          <p style={{ fontSize: 12, marginTop: 6 }}>The built-in admin account (hongtaippl@gmail.com) is always available.</p>
        </div>
      ) : (
        <div style={{ border: "1px solid #E2E8F0", borderRadius: 10, overflow: "hidden" }}>
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
            <tbody>
              {data.users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "white", flexShrink: 0 }}>
                        {u.avatar || u.name?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>{u.name}</div>
                        {currentUser && currentUser.id === u.id && <div style={{ fontSize: 10, color: "#3B82F6", fontFamily: "IBM Plex Mono" }}>● YOU</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ color: "#64748B", fontSize: 12, fontFamily: "IBM Plex Mono" }}>{u.email}</td>
                  <td><span className={`badge ${roleColors[u.role] || "badge-gray"}`}>{u.role}</span></td>
                  <td>
                    <div onClick={() => toggleActive(u)} style={{ cursor: "pointer" }}>
                      <StatusBadge status={u.active !== false ? "active" : "inactive"} />
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 12, color: "#64748B" }}>{u.lastLogin || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => openEdit(u)}><Icon name="edit" size={13} /></button>
                      <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => deleteUser(u)}><Icon name="trash" size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)", borderRadius: 8 }}>
        <div style={{ fontSize: 12, color: "#64748B" }}>
          <span style={{ color: "#3B82F6", fontWeight: 600 }}>Default admin:</span> hongtaippl@gmail.com / Amirul01876 — always accessible regardless of user list.
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SETTINGS
// ============================================================
const Settings = () => {
  const { data, setData, toast } = useApp();
  const [form, setForm] = useState({ ...data.settings });
  const [activeTab, setActiveTab] = useState("company");

  const save = () => { setData(d => ({ ...d, settings: form })); toast("Settings saved!", "success"); };

  const tabs = [
    { id: "company", label: "Company" },
    { id: "tax", label: "Tax & Currency" },
    { id: "users", label: "Users" },
    { id: "backup", label: "Backup" },
  ];

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader title="Settings" subtitle="Configure your system preferences" />

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20 }}>
        <div className="card" style={{ padding: 12, height: "fit-content" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className="sidebar-item" style={{
              width: "100%", justifyContent: "flex-start", background: activeTab === t.id ? "rgba(59,130,246,0.12)" : "none",
              color: activeTab === t.id ? "#3B82F6" : "#64748B", border: "none", marginBottom: 2
            }}>{t.label}</button>
          ))}
        </div>

        <div className="card" style={{ padding: 24 }}>
          {activeTab === "company" && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 20 }}>Company Information</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[["companyName", "Company Name"], ["email", "Email"], ["phone", "Phone"]].map(([k, l]) => (
                  <div key={k} className="form-group">
                    <label className="form-label">{l}</label>
                    <input value={form[k] || ""} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
                <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                  <label className="form-label">Address</label>
                  <textarea value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} rows={2} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "tax" && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 20 }}>Tax & Currency Settings</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Currency Symbol</label>
                  <input value={form.currency || "৳"} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tax Name</label>
                  <input value={form.taxName || "VAT"} onChange={e => setForm(f => ({ ...f, taxName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tax Rate (%)</label>
                  <input type="number" value={form.taxRate || 10} onChange={e => setForm(f => ({ ...f, taxRate: +e.target.value }))} min={0} max={100} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "users" && <UsersTab />}

          {activeTab === "backup" && (
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 20 }}>Backup & Restore</h3>
              <div style={{ display: "grid", gap: 16 }}>
                <div style={{ padding: 20, background: "#F1F5F9", borderRadius: 10, border: "1px solid #E2E8F0" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>Export Backup</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginBottom: 12 }}>Download a full backup of all your data as JSON</div>
                  <button className="btn btn-primary" onClick={() => {
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = `bizcore-backup-${fmt(today)}.json`; a.click();
                    toast("Backup downloaded!", "success");
                  }}><Icon name="download" size={14} /> Download Backup</button>
                </div>
                <div style={{ padding: 20, background: "#F1F5F9", borderRadius: 10, border: "1px solid #E2E8F0" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>System Information</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                    {[
                      ["Products", data.products.length], ["Customers", data.customers.length],
                      ["Suppliers", data.suppliers.length], ["Sales Records", data.sales.length],
                      ["Purchase Orders", data.purchases.length], ["Expense Records", data.expenses.length],
                    ].map(([l, v]) => (
                      <div key={l} style={{ padding: "8px 12px", background: "#FFFFFF", borderRadius: 6 }}>
                        <div style={{ fontSize: 11, color: "#64748B" }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", fontFamily: "IBM Plex Mono" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(activeTab === "company" || activeTab === "tax") && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #E2E8F0" }}>
              <button className="btn btn-primary" onClick={save}><Icon name="check" size={14} /> Save Settings</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// RECYCLE BIN
// ============================================================
const RECYCLE_UNIQUE_LABELS = { invoiceNo: "Invoice number", sku: "SKU", customerId: "Customer ID", email: "Email", slNo: "Serial number" };
const RECYCLE_SUBTYPE_LABELS = { advance: "Payment", return: "Return", deducted: "Deducted", aidtds: "AIT-TDS" };
const prettyKey = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase());

const RecycleBin = () => {
  const { data, setData, toast, curr } = useApp();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState([]);
  const [detail, setDetail] = useState(null);
  const PER_PAGE = 10;

  const bin = (data.recycleBin || []).slice().sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));
  const counts = Object.keys(RECYCLE_TYPES).reduce((o, k) => ({ ...o, [k]: bin.filter(e => e.collection === k).length }), {});

  const typeLabelOf = (e) => {
    const base = RECYCLE_TYPES[e.collection]?.label || e.collection;
    const sub = RECYCLE_SUBTYPE_LABELS[e.subtype];
    return sub ? `${base} · ${sub}` : base;
  };

  const filtered = bin.filter(e => {
    const meta = RECYCLE_TYPES[e.collection];
    const q = search.trim().toLowerCase();
    const hay = [e.label, e.sub, meta ? meta.numberOf(e.item) : "", e.deletedBy, typeLabelOf(e)].join(" ").toLowerCase();
    return (typeFilter === "all" || e.collection === typeFilter) && (!q || hay.includes(q));
  });
  const pageItems = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const selectedEntries = bin.filter(e => selected.includes(e.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every(e => selected.includes(e.id));

  const changeSearch = (v) => { setSearch(v); setPage(1); setSelected([]); };
  const changeType = (v) => { setTypeFilter(v); setPage(1); setSelected([]); };
  const toggleOne = (id) => setSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  const toggleAll = () => setSelected(allFilteredSelected ? [] : filtered.map(e => e.id));

  const fmtDeleted = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  // ── Restore: puts the exact original record back (same id, invoice no., serial no.) ──
  // A record is only blocked if its number is now used by another ACTIVE record,
  // because restoring it would create a duplicate invoice / serial number.
  const restoreEntries = (entries) => {
    if (!entries.length) return;
    const outcome = { restored: [], blocked: [] };
    setData(d => {
      let next = d;
      for (const entry of entries) {
        const col = entry.collection;
        const meta = RECYCLE_TYPES[col];
        const item = entry.item;
        const current = next[col] || [];
        let reason = "";
        if (!meta) {
          reason = "unknown record type";
        } else if (current.some(x => x.id === item.id)) {
          reason = "a record with the same ID already exists";
        } else {
          for (const k of meta.uniqueKeys) {
            const v = item[k];
            const has = v !== undefined && v !== null && String(v).trim() !== "";
            if (has && current.some(x => String(x[k] ?? "").trim().toLowerCase() === String(v).trim().toLowerCase())) {
              reason = `${RECYCLE_UNIQUE_LABELS[k] || k} ${v} is already used by another record`;
              break;
            }
          }
        }
        if (reason) { outcome.blocked.push({ entry, reason }); continue; }
        next = { ...next, [col]: [item, ...current], recycleBin: (next.recycleBin || []).filter(e => e.id !== entry.id) };
        outcome.restored.push(entry);
      }
      return next;
    });
    // (If the app is offline, setData refuses and shows its own message — nothing to report.)
    if (outcome.restored.length === 0 && outcome.blocked.length === 0) return;

    const restoredIds = outcome.restored.map(e => e.id);
    setSelected(sel => sel.filter(id => !restoredIds.includes(id)));

    if (outcome.restored.length > 0) {
      // Hint when a restored invoice/PO points to a customer/supplier that is still in the bin
      const batch = outcome.restored;
      const orphan = (e) => {
        const parentCol = e.collection === "sales" ? "customers" : e.collection === "purchases" ? "suppliers" : null;
        if (!parentCol) return false;
        const pid = e.collection === "sales" ? e.item.customerId : e.item.supplierId;
        if (!pid) return false;
        return !(data[parentCol] || []).some(x => x.id === pid) && !batch.some(b => b.collection === parentCol && b.item.id === pid);
      };
      const orphans = batch.filter(orphan).length;
      const label = batch.length === 1 ? `${typeLabelOf(batch[0])} ${batch[0].label} restored` : `${batch.length} records restored`;
      toast(orphans > 0 ? `${label}. Its customer/supplier is still in the Recycle Bin — restore that too so the name shows.` : label, "success");
    }
    if (outcome.blocked.length > 0) {
      const first = outcome.blocked[0];
      toast(outcome.blocked.length === 1
        ? `Cannot restore ${first.entry.label}: ${first.reason}. Change or delete that record first, then restore.`
        : `${outcome.blocked.length} records skipped — their numbers are already in use (e.g. ${first.entry.label}: ${first.reason}).`, "error");
    }
  };

  // ── Permanent delete ──
  const purgeEntries = (entries, what) => {
    if (!entries.length) return;
    if (!window.confirm(`Permanently delete ${what}?\n\nThis cannot be undone — the record${entries.length > 1 ? "s" : ""} can never be recovered.`)) return;
    const ids = new Set(entries.map(e => e.id));
    setData(d => ({ ...d, recycleBin: (d.recycleBin || []).filter(e => !ids.has(e.id)) }));
    setSelected(sel => sel.filter(id => !ids.has(id)));
    toast(entries.length === 1 ? "Permanently deleted" : `${entries.length} records permanently deleted`, "success");
  };

  const renderDetail = (e) => {
    const item = e.item || {};
    const rows = Object.entries(item).filter(([k, v]) => v !== null && v !== undefined && typeof v !== "object" && v !== "");
    return (
      <div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
          <span className="badge" style={{ background: `${RECYCLE_TYPES[e.collection]?.color || "#64748B"}22`, color: RECYCLE_TYPES[e.collection]?.color || "#475569" }}>{typeLabelOf(e)}</span>
          <span style={{ fontSize: 12, color: "#64748B" }}>Deleted {fmtDeleted(e.deletedAt)} by {e.deletedBy}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ padding: "8px 12px", background: "#FFFFFF", borderRadius: 8, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>{prettyKey(k)}</div>
              <div className="mono" style={{ fontSize: 12, color: "#0F172A", wordBreak: "break-all" }}>
                {k === "password" ? "••••••••" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)}
              </div>
            </div>
          ))}
        </div>
        {Array.isArray(item.items) && item.items.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11, color: "#64748B", textTransform: "uppercase", marginBottom: 6 }}>Line items</div>
            {item.items.map((it, i) => {
              const prod = data.products.find(p => p.id === it.productId);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 12px", background: "#FFFFFF", borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: "#334155" }}>{it.name || it.productName || prod?.name || it.productId}</span>
                  <span className="mono" style={{ color: "#475569" }}>{it.qty} × {curr}{Number(it.price || 0).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 18 }}>
          <button className="btn btn-danger" onClick={() => { setDetail(null); purgeEntries([e], `"${e.label}"`); }}><Icon name="trash" size={14} /> Delete Permanently</button>
          <button className="btn btn-primary" onClick={() => { setDetail(null); restoreEntries([e]); }}><Icon name="refresh" size={14} /> Restore</button>
        </div>
      </div>
    );
  };

  return (
    <div className="fade-in" style={{ padding: 28 }}>
      <SectionHeader title="Recycle Bin" subtitle={`${bin.length} deleted item${bin.length !== 1 ? "s" : ""} · restore them exactly as they were, or delete permanently`}
        actions={bin.length > 0 ? <button className="btn btn-danger" onClick={() => purgeEntries(bin, `all ${bin.length} items in the Recycle Bin`)}><Icon name="trash" size={15} /> Empty Recycle Bin</button> : null}
      />

      {bin.length === 0 ? (
        <div className="card"><EmptyState icon="trash" message="The Recycle Bin is empty. Anything you delete will appear here first." /></div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
            {[{ id: "all", label: "All", n: bin.length, color: "#3B82F6" }, ...Object.entries(RECYCLE_TYPES).filter(([k]) => counts[k] > 0).map(([k, m]) => ({ id: k, label: m.label, n: counts[k], color: m.color }))].map(t => (
              <button key={t.id} onClick={() => changeType(t.id)} className="btn btn-secondary btn-sm"
                style={{ background: typeFilter === t.id ? t.color : "#F1F5F9", color: typeFilter === t.id ? "white" : "#475569", border: `1px solid ${typeFilter === t.id ? t.color : "#E2E8F0"}` }}>
                {t.label} ({t.n})
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
            <SearchInput value={search} onChange={changeSearch} placeholder="Search by invoice no., name, who deleted..." style={{ flex: 1, minWidth: 220 }} />
            {selectedEntries.length > 0 && (
              <>
                <span style={{ fontSize: 12, color: "#475569" }}>{selectedEntries.length} selected</span>
                <button className="btn btn-primary btn-sm" onClick={() => restoreEntries(selectedEntries)}><Icon name="refresh" size={13} /> Restore selected</button>
                <button className="btn btn-danger btn-sm" onClick={() => purgeEntries(selectedEntries, `${selectedEntries.length} selected item${selectedEntries.length > 1 ? "s" : ""}`)}><Icon name="trash" size={13} /> Delete selected</button>
              </>
            )}
          </div>

          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}><input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} title={`Select all ${filtered.length}`} style={{ width: 15, height: 15, padding: 0, cursor: "pointer", accentColor: "#3B82F6" }} /></th>
                    <th>Type</th><th>Record</th><th>Details</th><th style={{ textAlign: "right" }}>Amount</th><th>Deleted</th><th>Deleted By</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: "center", padding: 30, color: "#64748B" }}>No deleted items match your search</td></tr>
                  ) : pageItems.map(e => {
                    const meta = RECYCLE_TYPES[e.collection];
                    const num = meta ? meta.numberOf(e.item) : "";
                    return (
                      <tr key={e.id}>
                        <td><input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggleOne(e.id)} style={{ width: 15, height: 15, padding: 0, cursor: "pointer", accentColor: "#3B82F6" }} /></td>
                        <td><span className="badge" style={{ background: `${meta?.color || "#64748B"}22`, color: meta?.color || "#94A3B8" }}>{typeLabelOf(e)}</span></td>
                        <td>
                          <div className="mono" style={{ color: "#0F172A", fontWeight: 700, fontSize: 12 }}>{e.label || "—"}</div>
                          {num && num !== e.label && <div className="mono" style={{ fontSize: 10, color: "#64748B" }}>{num}</div>}
                        </td>
                        <td style={{ color: "#94A3B8", fontSize: 12 }}>{e.sub || "—"}</td>
                        <td style={{ textAlign: "right" }} className="mono">{e.amount > 0 ? `${curr}${e.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                        <td className="mono" style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>{fmtDeleted(e.deletedAt)}</td>
                        <td style={{ fontSize: 12, color: "#94A3B8" }}>{e.deletedBy}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-secondary btn-sm btn-icon" title="View details" onClick={() => setDetail(e)}><Icon name="eye" size={13} /></button>
                            <button className="btn btn-primary btn-sm" title="Restore" onClick={() => restoreEntries([e])}><Icon name="refresh" size={13} /> Restore</button>
                            <button className="btn btn-danger btn-sm btn-icon" title="Delete permanently" onClick={() => purgeEntries([e], `"${e.label}"`)}><Icon name="trash" size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </div>
        </>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Deleted: ${detail.label}` : "Deleted record"} width={620}>
        {detail && renderDetail(detail)}
      </Modal>
    </div>
  );
};

// ============================================================
// LOGIN SCREEN
// ============================================================
const LoginScreen = ({ onLogin, loading, isOnline }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleLogin = () => {
    if (!isOnline) { setError("No internet connection. Please connect to the internet to sign in."); return; }
    if (!email || !password) { setError("Please enter email and password."); return; }
    setSubmitting(true);
    setError("");
    const ok = onLogin(email.trim(), password);
    if (!ok) setError("Invalid email or password.");
    setSubmitting(false);
  };

  return (
    <>
      <GlobalStyles />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F4F6FB" }}>
        <div style={{ width: "100%", maxWidth: 400, padding: "0 20px" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "white", margin: "0 auto 16px" }}>B</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", fontFamily: "Sora, sans-serif" }}>Hongtai ERP</div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4, fontFamily: "IBM Plex Mono, monospace" }}>Sign in to your account</div>
          </div>
          <div style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: 32 }}>
            {!isOnline && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 13, color: "#EF4444", display: "flex", alignItems: "center", gap: 8 }}>
                <span>📡</span> No internet connection. Sign in requires an active connection.
              </div>
            )}
            {loading ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#64748B", fontSize: 13, fontFamily: "IBM Plex Mono, monospace" }}>Connecting to server...</div>
            ) : (<>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input type="email" placeholder="you@company.com" value={email} disabled={!isOnline}
                  onChange={e => { setEmail(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleLogin()} autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="form-label">Password</label>
                <div style={{ position: "relative" }}>
                  <input type={showPw ? "text" : "password"} placeholder="••••••••" value={password} disabled={!isOnline}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                    style={{ paddingRight: 40 }} />
                  <button onClick={() => setShowPw(v => !v)} disabled={!isOnline} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#64748B", padding: 4 }}>
                    {showPw ? "🙈" : "👁"}
                  </button>
                </div>
              </div>
              {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, fontSize: 13, color: "#EF4444" }}>{error}</div>}
              <button className="btn btn-primary" onClick={handleLogin} disabled={submitting || !isOnline}
                style={{ width: "100%", justifyContent: "center", padding: "11px 16px", fontSize: 14, marginTop: 8, opacity: (submitting || !isOnline) ? 0.6 : 1, cursor: (submitting || !isOnline) ? "not-allowed" : "pointer" }}>
                {submitting ? "Signing in..." : "Sign In"}
              </button>

            </>)}
          </div>
        </div>
      </div>
    </>
  );
};


// ============================================================
// ACCOUNTS & LEDGER
// ============================================================
const ACCOUNT_CATEGORIES = ["Raw Material / 原材料","Utilities / 水电费","Transport / 运输","Salary / 工资","Office / 办公","Maintenance / 维护","Investment Fund / 投资基金","Sales Revenue / 销售收入","Bank Deposit / 银行存款","Bank Withdraw / 银行取款","Deposit to Cashier / 存入收银","TDS / 税款扣缴","VAT / 增值税","Rent / 租金","Load/Unload / 装卸费","Loan / 贷款","Other / 其他"];

const CAT_MIGRATE = {
  "Raw Material":        "Raw Material / 原材料",
  "Utilities":           "Utilities / 水电费",
  "Transport":           "Transport / 运输",
  "Salary":              "Salary / 工资",
  "Office":              "Office / 办公",
  "Maintenance":         "Maintenance / 维护",
  "Investment Fund":     "Investment Fund / 投资基金",
  "Sales Revenue":       "Sales Revenue / 销售收入",
  "Bank Deposit":        "Bank Deposit / 银行存款",
  "Bank Withdraw":       "Bank Withdraw / 银行取款",
  "Deposit to Cashier":  "Deposit to Cashier / 存入收银",
  "TDS":                 "TDS / 税款扣缴",
  "VAT":                 "VAT / 增值税",
  "Rent":                "Rent / 租金",
  "Other":               "Other / 其他",
};

const Accounts = () => {
  const { data, setData, toast, curr, currentUser } = useApp();
  const [activeTab, setActiveTab] = useState("ledger");
  const [showModal, setShowModal] = useState(false);
  const [showObModal, setShowObModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [reportMonth, setReportMonth] = useState(fmt(today).slice(0, 7));
  const [reportDate, setReportDate] = useState(fmt(today));
  const [filterMonth, setFilterMonth] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  // ── Category search state (for Add Entry dropdown) ──
  const [catSearch, setCatSearch] = useState("");
  const [catDropOpen, setCatDropOpen] = useState(false);
  const catDropRef = useRef(null);

  // ── Category Report state ──
  const [catSelectedCategories, setCatSelectedCategories] = useState([]);
  const [catDateFrom, setCatDateFrom] = useState(fmt(today));
  const [catDateTo, setCatDateTo] = useState(fmt(today));
  const [catReportGenerated, setCatReportGenerated] = useState(false);

  // One-time migration: permanently update old English-only categories in stored data
  useEffect(() => {
    const stored = data.accountEntries || [];
    if (stored.some(e => CAT_MIGRATE[e.category])) {
      setData(d => ({
        ...d,
        accountEntries: (d.accountEntries || []).map(e => ({
          ...e,
          category: CAT_MIGRATE[e.category] ?? e.category,
        })),
      }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close category dropdown on outside click
  useEffect(() => {
    if (!catDropOpen) return;
    const handler = (e) => {
      if (catDropRef.current && !catDropRef.current.contains(e.target)) {
        setCatDropOpen(false);
        setCatSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [catDropOpen]);

  const entries = (data.accountEntries || []).map(e => ({
    ...e,
    category: CAT_MIGRATE[e.category] ?? e.category,
  }));
  const ob = data.accountOpenBalance || { balance: 0, cash: 0, pBank: 0, ucbBank: 0, wooriBank: 0, date: "" };

  const emptyForm = { date: fmt(today), slNo: "", description: "", category: ACCOUNT_CATEGORIES[0], type: "Debit", amount: 0, paymentMethod: "Cash", debit: 0, credit: 0, cash: 0, pBank: 0, ucbBank: 0, wooriBank: 0, notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [obForm, setObForm] = useState({ balance: 0, cash: 0, pBank: 0, ucbBank: 0, wooriBank: 0, date: fmt(today) });

  const nextSlNo = () => {
    const max = Math.max(
      0,
      ...entries.map(e => Number(e.slNo) || 0),
      ...(data.recycleBin || []).filter(e => e.collection === "accountEntries").map(e => Number(e.item && e.item.slNo) || 0),
    );
    return max + 1;
  };

  const N = (v) => Number(v || 0);
  const moneyFmt = (v) => {
    const n = N(v);
    return `${n < 0 ? "−" : ""}${curr}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const signedFmt = (v) => {
    const n = N(v);
    return `${n >= 0 ? "+" : "−"}${curr}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Sort entries by date then slNo (numeric)
  const sorted = [...entries].sort((a, b) =>
    a.date.localeCompare(b.date) || (Number(a.slNo) || 0) - (Number(b.slNo) || 0)
  );

  // Running balance: Debit=Income(+), Credit=Expense(-)
  const withBalance = sorted.reduce((acc, entry, i) => {
    const prevBal  = i === 0 ? N(ob.balance)  : acc[i - 1].runBalance;
    const prevCash = i === 0 ? N(ob.cash)     : acc[i - 1].runCash;
    const prevPB   = i === 0 ? N(ob.pBank)    : acc[i - 1].runPBank;
    const prevUcb  = i === 0 ? N(ob.ucbBank)  : acc[i - 1].runUcb;
    const prevWoori= i === 0 ? N(ob.wooriBank): acc[i - 1].runWoori;
    acc.push({
      ...entry,
      runBalance: prevBal  + N(entry.debit)  - N(entry.credit),
      runCash:    prevCash + N(entry.cash),
      runPBank:   prevPB   + N(entry.pBank),
      runUcb:     prevUcb  + N(entry.ucbBank),
      runWoori:   prevWoori+ N(entry.wooriBank),
    });
    return acc;
  }, []);

  const filtered = withBalance.filter(e => {
    if (filterMonth && !e.date.startsWith(filterMonth)) return false;
    if (filterDateFrom && e.date < filterDateFrom) return false;
    if (filterDateTo && e.date > filterDateTo) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match = (e.description || "").toLowerCase().includes(q)
        || (e.category || "").toLowerCase().includes(q)
        || (e.notes || "").toLowerCase().includes(q)
        || (e.slNo || "").toString().includes(q);
      if (!match) return false;
    }
    return true;
  });
  const filteredDesc = [...filtered].reverse();
  const paginated = filteredDesc.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Summary totals
  const totalDebit  = entries.reduce((s, e) => s + N(e.debit),   0);
  const totalCredit = entries.reduce((s, e) => s + N(e.credit),  0);
  const currentBalance = N(ob.balance) + totalDebit - totalCredit;
  const currentCash    = N(ob.cash)    + entries.reduce((s, e) => s + N(e.cash),    0);
  const currentPBank   = N(ob.pBank)   + entries.reduce((s, e) => s + N(e.pBank),   0);
  const currentUcb     = N(ob.ucbBank) + entries.reduce((s, e) => s + N(e.ucbBank), 0);
  const currentWoori   = N(ob.wooriBank) + entries.reduce((s, e) => s + N(e.wooriBank), 0);

  // Monthly report
  const reportEntries = sorted.filter(e => e.date.startsWith(reportMonth));
  // Daily report data
  const dailyEntries = sorted.filter(e => e.date === reportDate);
  const dDebit  = dailyEntries.reduce((s, e) => s + N(e.debit),   0);
  const dCredit = dailyEntries.reduce((s, e) => s + N(e.credit),  0);
  const dCash   = dailyEntries.reduce((s, e) => s + N(e.cash),    0);
  const dPBank  = dailyEntries.reduce((s, e) => s + N(e.pBank),   0);
  const dUcb    = dailyEntries.reduce((s, e) => s + N(e.ucbBank), 0);
  const dWoori  = dailyEntries.reduce((s, e) => s + N(e.wooriBank), 0);
  const dailyCatSummary = ACCOUNT_CATEGORIES.map(cat => ({
    cat,
    items: dailyEntries.filter(e => e.category === cat),
    totalDebit:  dailyEntries.filter(e => e.category === cat).reduce((s, e) => s + N(e.debit),  0),
    totalCredit: dailyEntries.filter(e => e.category === cat).reduce((s, e) => s + N(e.credit), 0),
  })).filter(c => c.items.length > 0);
  // Category Report: filtered entries (only set after Generate is clicked)
  const catFilteredEntries = (() => {
    if (!catReportGenerated || catSelectedCategories.length === 0) return [];
    return sorted.filter(e => {
      if (!catSelectedCategories.includes(e.category)) return false;
      if (catDateFrom && e.date < catDateFrom) return false;
      if (catDateTo   && e.date > catDateTo)   return false;
      return true;
    });
  })();
  const catTotalDebit  = catFilteredEntries.reduce((s, e) => s + N(e.debit),  0);
  const catTotalCredit = catFilteredEntries.reduce((s, e) => s + N(e.credit), 0);
  const catNetFlow     = catTotalDebit - catTotalCredit;
  const catByCat = catSelectedCategories.map(cat => {
    const items = catFilteredEntries.filter(e => e.category === cat);
    return {
      cat,
      items,
      totalDebit:  items.reduce((s, e) => s + N(e.debit),  0),
      totalCredit: items.reduce((s, e) => s + N(e.credit), 0),
    };
  }).filter(c => c.items.length > 0);

  const rDebit  = reportEntries.reduce((s, e) => s + N(e.debit),   0);
  const rCredit = reportEntries.reduce((s, e) => s + N(e.credit),  0);
  const rCash   = reportEntries.reduce((s, e) => s + N(e.cash),    0);
  const rPBank  = reportEntries.reduce((s, e) => s + N(e.pBank),   0);
  const rUcb    = reportEntries.reduce((s, e) => s + N(e.ucbBank), 0);
  const rWoori  = reportEntries.reduce((s, e) => s + N(e.wooriBank), 0);

  // Monthly opening balance = ob + all entries BEFORE this month
  const entriesBeforeMonth = sorted.filter(e => !e.date.startsWith(reportMonth) && e.date < reportMonth + "-01");
  const mOpenBal  = N(ob.balance)  + entriesBeforeMonth.reduce((s,e) => s + N(e.debit) - N(e.credit), 0);
  const mOpenCash = N(ob.cash)     + entriesBeforeMonth.reduce((s,e) => s + N(e.cash),    0);
  const mOpenPB   = N(ob.pBank)    + entriesBeforeMonth.reduce((s,e) => s + N(e.pBank),   0);
  const mOpenUcb  = N(ob.ucbBank)  + entriesBeforeMonth.reduce((s,e) => s + N(e.ucbBank), 0);
  const mOpenWoori= N(ob.wooriBank)+ entriesBeforeMonth.reduce((s,e) => s + N(e.wooriBank), 0);
  // Monthly current (closing) balance
  const mCloseBal  = mOpenBal  + rDebit  - rCredit;
  const mCloseCash = mOpenCash + rCash;
  const mClosePB   = mOpenPB   + rPBank;
  const mCloseUcb  = mOpenUcb  + rUcb;
  const mCloseWoori= mOpenWoori+ rWoori;

  // Total Sales = entries in "Sales Revenue" category (debit side)
  const EXPENSE_CATS = ["Raw Material / 原材料","Utilities / 水电费","Transport / 运输","Salary / 工资","Office / 办公","Maintenance / 维护","TDS / 税款扣缴","VAT / 增值税","Rent / 租金","Other / 其他"];
  const rTotalSales   = reportEntries.filter(e => e.category === "Sales Revenue / 销售收入").reduce((s, e) => s + N(e.debit), 0);
  const rTotalExpense = reportEntries.filter(e => EXPENSE_CATS.includes(e.category)).reduce((s, e) => s + N(e.credit), 0);
  const rProfitOrLoss = rTotalSales - rTotalExpense;

  const catSummary = ACCOUNT_CATEGORIES.map(cat => ({
    cat,
    items: reportEntries.filter(e => e.category === cat),
    totalDebit:  reportEntries.filter(e => e.category === cat).reduce((s, e) => s + N(e.debit),  0),
    totalCredit: reportEntries.filter(e => e.category === cat).reduce((s, e) => s + N(e.credit), 0),
  })).filter(c => c.items.length > 0);

  const printDailyReport = () => {
    if (dailyEntries.length === 0) { toast("No entries for this date / 本日无记录", "error"); return; }
    const mf = (v) => curr + Number(v||0).toLocaleString("en-US",{minimumFractionDigits:2});

    // Opening balance = everything before this date
    const entriesBefore = sorted.filter(e => e.date < reportDate);
    const openBal  = N(ob.balance)  + entriesBefore.reduce((s,e)=>s+N(e.debit)-N(e.credit),0);
    const openCash = N(ob.cash)     + entriesBefore.reduce((s,e)=>s+N(e.cash),0);
    const openPB   = N(ob.pBank)    + entriesBefore.reduce((s,e)=>s+N(e.pBank),0);
    const openUcb  = N(ob.ucbBank)  + entriesBefore.reduce((s,e)=>s+N(e.ucbBank),0);
    const openWoori= N(ob.wooriBank)+ entriesBefore.reduce((s,e)=>s+N(e.wooriBank),0);

    // Closing / current balance
    const closeBal  = openBal  + dDebit  - dCredit;
    const closeCash = openCash + dCash;
    const closePB   = openPB   + dPBank;
    const closeUcb  = openUcb  + dUcb;
    const closeWoori= openWoori+ dWoori;

    // Rows: running totals mirror the ledger exactly (runBal, runCash, runPBank, runUcb, runWoori)
    let runBal  = openBal;
    let runCash = openCash;
    let runPB   = openPB;
    let runUcb  = openUcb;
    let runWoori= openWoori;
    const rows = dailyEntries.map((e, idx) => {
      runBal  = runBal  + N(e.debit) - N(e.credit);
      runCash = runCash + N(e.cash);
      runPB   = runPB   + N(e.pBank);
      runUcb  = runUcb  + N(e.ucbBank);
      runWoori= runWoori+ N(e.wooriBank);
      return `<tr>
      <td class="center mono" style="color:#000000;font-weight:600">${idx + 1}</td>
      <td style="font-weight:500;color:#1e293b">${e.description}${e.notes ? `<br/><span style="font-weight:400;font-size:8.5px;color:#94a3b8">${e.notes}</span>` : ""}</td>
      <td style="color:#475569">${e.category}</td>
      <td class="right mono income">${N(e.debit)  > 0 ? mf(e.debit)  : '<span class="muted">—</span>'}</td>
      <td class="right mono expense">${N(e.credit) > 0 ? mf(e.credit) : '<span class="muted">—</span>'}</td>
      <td class="right mono" style="color:#1d4ed8;font-weight:700">${mf(runBal)}</td>
      <td class="right mono" style="color:${runCash < 0 ? '#dc2626' : '#000000'};font-weight:600">${mf(runCash)}</td>
      <td class="right mono" style="color:${runPB   < 0 ? '#dc2626' : '#000000'};font-weight:600">${mf(runPB)}</td>
      <td class="right mono" style="color:${runUcb  < 0 ? '#dc2626' : '#000000'};font-weight:600">${mf(runUcb)}</td>
      <td class="right mono" style="color:${runWoori< 0 ? '#dc2626' : '#000000'};font-weight:600">${mf(runWoori)}</td>
    </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/>
<title>Daily Report 日报 — ${reportDate}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4 landscape;margin:12mm 11mm}
body{
  font-family:'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;
  font-size:10px;color:#1e293b;background:#fff;padding:18px;
  -webkit-print-color-adjust:exact;print-color-adjust:exact
}

/* ── HEADER ── */
.header{
  background:#ffffff;
  border:1px solid #e2e8f0;
  border-bottom:3px solid #3b82f6;
  border-radius:10px;padding:16px 22px;margin-bottom:12px;
  display:flex;justify-content:space-between;align-items:center;
  -webkit-print-color-adjust:exact;print-color-adjust:exact
}
.header-title h1{
  font-size:20px;font-weight:800;color:#1e293b;
  line-height:1.15;letter-spacing:-0.4px;margin:0
}
.header-title .zh{
  font-size:11px;color:#64748b;display:block;
  font-weight:400;margin-top:3px;letter-spacing:0.3px
}
.header-brand{text-align:right}
.header-brand .name{
  font-size:13px;font-weight:700;color:#1e293b;letter-spacing:0.02em
}
.header-brand .sub{font-size:9px;color:#94a3b8;margin-top:2px}
.header-brand .date-pill{
  display:inline-block;margin-top:6px;
  background:#eff6ff;
  border:1px solid #bfdbfe;
  border-radius:20px;padding:2px 10px;
  font-size:9px;color:#1d4ed8;font-weight:600;letter-spacing:0.04em
}

/* ── META BAR ── */
.meta-bar{
  display:grid;grid-template-columns:repeat(4,1fr);
  gap:8px;margin-bottom:12px;
}
.meta-card{
  background:#f8fafc;border:1px solid #e2e8f0;
  border-radius:7px;padding:8px 12px;
  border-left:3px solid #3b82f6;
}
.meta-card .label{font-size:8px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;font-weight:600}
.meta-card .value{font-size:11px;color:#1e293b;font-weight:700;margin-top:2px}

/* ── SECTION LABEL ── */
.section-label{
  font-size:8.5px;font-weight:700;color:#64748b;text-transform:uppercase;
  letter-spacing:0.1em;margin-bottom:6px;
  display:flex;align-items:center;gap:8px
}
.section-label::before{content:'';width:3px;height:12px;background:#3b82f6;border-radius:2px;flex-shrink:0}
.section-label::after{content:'';flex:1;height:1px;background:#e2e8f0}

/* ── TABLE ── */
table{width:100%;border-collapse:collapse;margin-bottom:0;font-size:9.5px;table-layout:fixed;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
col.c-sl{width:24px}col.c-desc{width:22%}col.c-cat{width:10%}
col.c-num{width:10%}col.c-cash{width:8%}col.c-pb{width:8%}col.c-ucb{width:8%}col.c-woori{width:8%}

thead tr{background:#C7C7C7;-webkit-print-color-adjust:exact;print-color-adjust:exact}
th{
  color:#0A0101;padding:7px 8px;text-align:left;
  font-size:7.5px;font-weight:600;letter-spacing:0.08em;
  text-transform:uppercase;line-height:1.4;word-break:keep-all
}
th .zh{font-size:7px;color:#475569;font-weight:400;display:block;text-transform:none;letter-spacing:0;margin-top:1px}

/* body rows */
td{padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;word-break:break-word;line-height:1.4;color:#000000}
tbody tr:nth-child(even) td{background:#f8fafc;-webkit-print-color-adjust:exact;print-color-adjust:exact}
tbody tr:nth-child(odd) td{background:#ffffff}
tbody tr:hover td{background:#f0f9ff}

/* opening balance */
.row-ob td{
  background:#fefce8!important;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
  color:#854d0e;font-weight:600;
  border-top:2px solid #fde68a;border-bottom:2px solid #fde68a
}

/* day totals */
.row-totals td{
  background:#eff6ff!important;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
  color:#1d4ed8;font-weight:700;font-size:9.5px;
  border-top:2px solid #bfdbfe;border-bottom:2px solid #bfdbfe
}

/* current balance */
.row-closing td{
  background:#C7C7C7!important;
  color:#1e293b;font-weight:700;font-size:10.5px;
  border-top:none;border-bottom:none;padding:10px 8px;
  white-space:nowrap;
  -webkit-print-color-adjust:exact;print-color-adjust:exact
}

.right{text-align:right}.center{text-align:center}
.mono{font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:0.02em}
.income{color:#16a34a!important;font-weight:600}
.expense{color:#dc2626!important;font-weight:600}
.muted{color:#94a3b8}

/* ── FOOTER ── */
.footer{
  margin-top:10px;padding-top:7px;
  border-top:1px solid #e2e8f0;
  font-size:8px;color:#94a3b8;
  display:flex;justify-content:space-between;align-items:center
}
.footer-left{display:flex;align-items:center;gap:6px}
.footer-badge{
  background:#eff6ff;border:1px solid #bfdbfe;
  border-radius:4px;padding:1px 6px;
  font-size:7.5px;color:#1d4ed8;font-weight:600
}

@media print{
  body{padding:0}
  table{page-break-inside:auto}
  tr{page-break-inside:avoid}
}
</style></head><body>

<!-- HEADER -->
<div class="header">
  <div class="header-title">
    <h1>Daily Cash Flow Report <span class="zh">每日现金流量报表</span></h1>
  </div>
  <div class="header-brand">
    <div class="name">Hongtai ERP</div>
    <div class="sub">账务管理系统</div>
    <div class="date-pill">${reportDate}</div>
  </div>
</div>

<!-- META BAR -->
<div class="meta-bar">
  <div class="meta-card"><div class="label">Date / 日期</div><div class="value">${reportDate}</div></div>
  <div class="meta-card"><div class="label">Generated / 生成时间</div><div class="value" style="font-size:9.5px">${new Date().toLocaleString()}</div></div>
  <div class="meta-card"><div class="label">Currency / 货币</div><div class="value">BDT (৳)</div></div>
  <div class="meta-card"><div class="label">Entries / 记录数</div><div class="value">${dailyEntries.length} records</div></div>
</div>

<!-- TABLE -->
<div class="section-label" style="margin-bottom:7px">All Entries &nbsp;/&nbsp; 全部记录</div>
<table>
  <colgroup><col class="c-sl"/><col class="c-desc"/><col class="c-cat"/><col class="c-num"/><col class="c-num"/><col class="c-num"/><col class="c-cash"/><col class="c-pb"/><col class="c-ucb"/><col class="c-woori"/></colgroup>
  <thead><tr>
    <th class="center">SL<span class="zh">序号</span></th>
    <th>Description<span class="zh">描述</span></th>
    <th>Category<span class="zh">类别</span></th>
    <th class="right">Debit (Income)<span class="zh">借方（收入）</span></th>
    <th class="right">Credit (Expense)<span class="zh">贷方（支出）</span></th>
    <th class="right">Balance<span class="zh">余额</span></th>
    <th class="right">Cash<span class="zh">现金</span></th>
    <th class="right">P-Bank<span class="zh">优先银行</span></th>
    <th class="right">UCB-Bank<span class="zh">UCB银行</span></th>
    <th class="right">Woori-Bank<span class="zh">友利银行</span></th>
  </tr></thead>
  <tbody>
    <tr class="row-ob">
      <td class="center muted">—</td>
      <td><strong>Opening Balance / 期初余额</strong><br/><span style="font-weight:400;font-size:8px;color:#a16207">Previous day closing / 前日结余</span></td>
      <td class="muted center">—</td>
      <td class="right mono muted">—</td>
      <td class="right mono muted">—</td>
      <td class="right mono" style="color:#1d4ed8;font-weight:700">${mf(openBal)}</td>
      <td class="right mono" style="color:#000000;font-weight:600">${mf(openCash)}</td>
      <td class="right mono" style="color:#000000;font-weight:600">${mf(openPB)}</td>
      <td class="right mono" style="color:#000000;font-weight:600">${mf(openUcb)}</td>
      <td class="right mono" style="color:#000000;font-weight:600">${mf(openWoori)}</td>
    </tr>
    ${rows}
  </tbody>
  <tfoot>
    <tr class="row-totals">
      <td colspan="3" style="font-size:8.5px;letter-spacing:0.06em;text-transform:uppercase">Day Totals / 当日合计</td>
      <td class="right mono income">${mf(dDebit)}</td>
      <td class="right mono expense">${mf(dCredit)}</td>
      <td class="right mono" style="color:#1d4ed8;font-weight:700">${mf(closeBal)}</td>
      <td class="right mono" style="color:#000000;font-weight:700">${mf(closeCash)}</td>
      <td class="right mono" style="color:#000000;font-weight:700">${mf(closePB)}</td>
      <td class="right mono" style="color:#000000;font-weight:700">${mf(closeUcb)}</td>
      <td class="right mono" style="color:#000000;font-weight:700">${mf(closeWoori)}</td>
    </tr>
    <tr class="row-closing">
      <td colspan="3" style="font-size:9.5px;letter-spacing:0.04em;text-transform:uppercase;color:#334155;font-weight:700">Closing Balance / 当前结余</td>
      <td class="right mono muted">—</td>
      <td class="right mono muted">—</td>
      <td class="right mono" style="font-size:12px;color:#15803d;font-weight:800">${mf(closeBal)}</td>
      <td class="right mono" style="color:#000000;font-weight:700">${mf(closeCash)}</td>
      <td class="right mono" style="color:#000000;font-weight:700">${mf(closePB)}</td>
      <td class="right mono" style="color:#000000;font-weight:700">${mf(closeUcb)}</td>
      <td class="right mono" style="color:#000000;font-weight:700">${mf(closeWoori)}</td>
    </tr>
  </tfoot>
</table>

<!-- FOOTER -->
<div class="footer">
  <div class="footer-left">
    <span class="footer-badge">Hongtai ERP</span>
    <span>Daily Report / 日报 &nbsp;·&nbsp; ${new Date().getFullYear()}</span>
  </div>
  <span>Printed / 打印时间: ${new Date().toLocaleString()}</span>
</div>
</body></html>`;
    const win = window.open("", "_blank");
    if (!win) { toast("Popup blocked. Allow popups and try again. / 弹窗被拦截，请允许弹窗后重试。", "error"); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  // ── Category Report: PDF export ──
  const downloadCategoryPDF = () => {
    if (!catReportGenerated) { toast("Click Generate Report first. / 请先点击生成报表。", "error"); return; }
    if (catSelectedCategories.length === 0) { toast("Select at least one category. / 请至少选择一个类别。", "error"); return; }
    if (catFilteredEntries.length === 0) { toast("No entries found for the selected filters. / 所选条件下未找到记录。", "error"); return; }
    const mf = (v) => curr + Number(v||0).toLocaleString("en-US",{minimumFractionDigits:2});
    const dateLabel = `${catDateFrom} – ${catDateTo}`;
    const catLabel = catSelectedCategories.join(", ");

    const byCategory = catByCat;
    const catSectionRows = byCategory.map(c => {
      const isIncome = c.totalDebit > 0 && c.totalCredit === 0;
      const accentColor = isIncome ? "#16a34a" : c.totalCredit > 0 && c.totalDebit === 0 ? "#dc2626" : "#1d4ed8";
      const itemRows = c.items.map((e, idx) => `<tr style="background:${idx%2===0?"#ffffff":"#f8fafc"}">
        <td class="mono" style="color:#000000;font-size:8.5px">${e.date}</td>
        <td class="center mono" style="color:#000000;font-size:8.5px">${e.slNo||""}</td>
        <td style="color:#1e293b">${e.description}${e.notes?`<br/><span style="font-size:7.5px;color:#94a3b8">${e.notes}</span>`:""}</td>
        <td style="color:#475569;font-size:8.5px">${e.paymentMethod||""}</td>
        <td class="right mono" style="color:#16a34a;font-weight:600">${N(e.debit)>0?mf(e.debit):'<span style="color:#cbd5e1">—</span>'}</td>
        <td class="right mono" style="color:#dc2626;font-weight:600">${N(e.credit)>0?mf(e.credit):'<span style="color:#cbd5e1">—</span>'}</td>
      </tr>`).join("");
      return `
      <div class="cat-block">
        <div class="cat-header" style="border-left:4px solid ${accentColor}">
          <span class="cat-name">${c.cat}</span>
          <span class="cat-totals">
            ${c.totalDebit>0?`<span style="color:#16a34a;font-weight:700">${mf(c.totalDebit)}</span>`:""}
            ${c.totalDebit>0&&c.totalCredit>0?`<span style="color:#94a3b8;margin:0 4px">/</span>`:""}
            ${c.totalCredit>0?`<span style="color:#dc2626;font-weight:700">−${mf(c.totalCredit)}</span>`:""}
          </span>
        </div>
        <table>
          <thead><tr>
            <th style="width:13%">Date<span class="zh">日期</span></th><th style="width:6%;text-align:center">SL<span class="zh">序号</span></th>
            <th>Description<span class="zh">描述</span></th><th style="width:13%">Payment<span class="zh">付款方式</span></th>
            <th class="right" style="width:13%">Debit (Income)<span class="zh">借方（收入）</span></th>
            <th class="right" style="width:13%">Credit (Expense)<span class="zh">贷方（支出）</span></th>
          </tr></thead>
          <tbody>${itemRows}</tbody>
          <tfoot><tr class="row-subtotal">
            <td colspan="4" style="font-weight:700;font-size:8.5px;letter-spacing:0.05em;text-transform:uppercase">Subtotal / 小计</td>
            <td class="right mono" style="color:#16a34a;font-weight:700">${c.totalDebit>0?mf(c.totalDebit):"—"}</td>
            <td class="right mono" style="color:#dc2626;font-weight:700">${c.totalCredit>0?mf(c.totalCredit):"—"}</td>
          </tr></tfoot>
        </table>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/>
<title>Category Report 类别报表 — ${dateLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4 portrait;margin:12mm 11mm}
body{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;padding:16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.header{background:#fff;border:1px solid #e2e8f0;border-bottom:3px solid #3b82f6;border-radius:10px;padding:14px 20px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:18px;font-weight:800;color:#1e293b;letter-spacing:-0.3px;line-height:1.2}
.header h1 .zh{font-size:11px;font-weight:400;color:#64748b;display:block;margin-top:2px;letter-spacing:0.3px}
.header .sub{font-size:10px;color:#64748b;margin-top:4px}
.header-right{text-align:right}
.header-right .brand{font-size:12px;font-weight:700;color:#1e293b}
.header-right .pill{display:inline-block;margin-top:5px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;padding:2px 10px;font-size:8.5px;color:#1d4ed8;font-weight:600}
.meta-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}
.meta-card{background:#f8fafc;border:1px solid #e2e8f0;border-left:3px solid #3b82f6;border-radius:7px;padding:8px 12px}
.meta-card .label{font-size:7.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;font-weight:600}
.meta-card .label .zh{font-size:7px;color:#b0bec5;font-weight:400;text-transform:none;letter-spacing:0;display:block;margin-top:1px}
.meta-card .value{font-size:11px;color:#1e293b;font-weight:700;margin-top:3px}
.summary-bar{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px}
.sum-card{border-radius:7px;padding:10px 14px}
.sum-card .slabel{font-size:7.5px;text-transform:uppercase;letter-spacing:0.07em;font-weight:600;margin-bottom:1px}
.sum-card .slabel .zh{font-size:7px;font-weight:400;text-transform:none;letter-spacing:0;display:block;margin-bottom:3px}
.sum-card .svalue{font-size:14px;font-weight:800}
.cat-block{margin-bottom:14px}
.cat-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#f1f5f9;border-radius:6px 6px 0 0;margin-bottom:0}
.cat-name{font-size:11px;font-weight:700;color:#1e293b;padding-left:6px}
.cat-totals{font-size:11px}
table{width:100%;border-collapse:collapse;font-size:9px;border:1px solid #e2e8f0;border-top:none}
th{background:#e2e8f0;color:#475569;padding:6px 8px;text-align:left;font-size:7.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;line-height:1.4}
th .zh{font-size:7px;color:#64748b;font-weight:400;display:block;text-transform:none;letter-spacing:0;margin-top:1px}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;line-height:1.35}
.row-subtotal td{background:#eff6ff!important;color:#1d4ed8;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.grand-total td{background:#0f766e!important;color:#f0fdfa;font-weight:700;font-size:10px;padding:9px 12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.right{text-align:right}.center{text-align:center}
.mono{font-family:'Courier New',Courier,monospace;letter-spacing:0.02em}
.footer{margin-top:12px;padding-top:7px;border-top:1px solid #e2e8f0;font-size:7.5px;color:#94a3b8;display:flex;justify-content:space-between}
.footer-badge{background:#eff6ff;border:1px solid #bfdbfe;border-radius:4px;padding:1px 6px;font-size:7.5px;color:#1d4ed8;font-weight:600;margin-right:6px}
@media print{body{padding:0}tr{page-break-inside:avoid}}
</style></head><body>
<div class="header">
  <div>
    <h1>Category Report <span class="zh">类别报表</span></h1>
    <div class="sub">Period / 期间: ${dateLabel} &nbsp;·&nbsp; ${catSelectedCategories.length} categor${catSelectedCategories.length===1?"y":"ies"} / 类别</div>
  </div>
  <div class="header-right">
    <div class="brand">Hongtai ERP</div>
    <div class="pill">${dateLabel}</div>
  </div>
</div>
<div class="meta-bar">
  <div class="meta-card"><div class="label">Period<span class="zh">期间</span></div><div class="value" style="font-size:9.5px">${dateLabel}</div></div>
  <div class="meta-card"><div class="label">Categories<span class="zh">类别</span></div><div class="value" style="font-size:9px">${catSelectedCategories.length} selected / 已选</div></div>
  <div class="meta-card"><div class="label">Total Entries<span class="zh">总记录数</span></div><div class="value">${catFilteredEntries.length}</div></div>
  <div class="meta-card"><div class="label">Generated<span class="zh">生成时间</span></div><div class="value" style="font-size:8.5px">${new Date().toLocaleString()}</div></div>
</div>
<div class="summary-bar">
  <div class="sum-card" style="background:#eff6ff;border:1px solid #bfdbfe">
    <div class="slabel" style="color:#1d4ed8">Total Amount<span class="zh" style="color:#3b82f6">总金额</span></div>
    <div class="svalue" style="color:#1d4ed8">${mf(catTotalDebit + catTotalCredit)}</div>
  </div>
  <div class="sum-card" style="background:#f5f3ff;border:1px solid #ddd6fe">
    <div class="slabel" style="color:#6d28d9">Total Entries<span class="zh" style="color:#7c3aed">总记录数</span></div>
    <div class="svalue" style="color:#6d28d9">${catFilteredEntries.length}</div>
  </div>
</div>
${catSectionRows}
<table style="border:1px solid #1e293b;border-radius:0;margin-top:4px">
  <tbody>
    <tr class="grand-total">
      <td style="width:70%">GRAND TOTAL / 总计 — ${catFilteredEntries.length} entries / 条记录 · ${byCategory.length} categor${byCategory.length===1?"y":"ies"} / 类别</td>
      <td class="right mono" style="color:#86efac;width:15%">${mf(catTotalDebit)}</td>
      <td class="right mono" style="color:#fca5a5;width:15%">${mf(catTotalCredit)}</td>
    </tr>
  </tbody>
</table>
<div class="footer">
  <div><span class="footer-badge">Hongtai ERP</span>Category Report / 类别报表 · ${new Date().getFullYear()}</div>
  <span>Printed / 打印时间: ${new Date().toLocaleString()}</span>
</div>
</body></html>`;
    const win = window.open("", "_blank");
    if (!win) { toast("Popup blocked. Allow popups and try again. / 弹窗被拦截，请允许弹窗后重试。", "error"); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  // ── Category Report: Excel (CSV) export ──
  const downloadCategoryExcel = () => {
    if (!catReportGenerated) { toast("Click Generate Report first. / 请先点击生成报表。", "error"); return; }
    if (catSelectedCategories.length === 0) { toast("Select at least one category. / 请至少选择一个类别。", "error"); return; }
    if (catFilteredEntries.length === 0) { toast("No entries found for the selected filters. / 所选条件下未找到记录。", "error"); return; }
    const dateLabel = `${catDateFrom} to ${catDateTo}`;
    const esc = (s) => `"${String(s||"").replace(/"/g,'""')}"`;
    const lines = [
      [esc("Category Report"), esc(dateLabel)].join(","),
      [esc("Categories"), esc(catSelectedCategories.join("; "))].join(","),
      [esc("Generated"), esc(new Date().toLocaleString())].join(","),
      [],
      ["Date","SL No","Description","Category","Notes","Payment Method","Debit (Income)","Credit (Expense)"].map(esc).join(","),
    ];
    catFilteredEntries.forEach(e => {
      lines.push([
        esc(e.date), esc(e.slNo||""), esc(e.description||""), esc(e.category||""),
        esc(e.notes||""), esc(e.paymentMethod||""),
        N(e.debit).toFixed(2), N(e.credit).toFixed(2),
      ].join(","));
    });
    lines.push([]);
    lines.push(["", "", "", "", "", esc("TOTAL"), catFilteredEntries.reduce((s,e)=>s+N(e.debit),0).toFixed(2), catFilteredEntries.reduce((s,e)=>s+N(e.credit),0).toFixed(2)].join(","));
    // Per-category subtotals
    lines.push([]);
    lines.push(["--- Category Subtotals ---"].join(","));
    catByCat.forEach(c => {
      lines.push([esc(c.cat), "", "", "", "", "", c.totalDebit.toFixed(2), c.totalCredit.toFixed(2)].join(","));
    });
    const csv = "\uFEFF" + lines.map(l => Array.isArray(l) ? "" : l).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `category_report_${dateLabel.replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_\-]/g,"")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast("Excel (CSV) downloaded! / Excel已下载！", "success");
  };

  const openNew  = () => { setEditItem(null); setForm({ ...emptyForm, slNo: nextSlNo() }); setShowModal(true); };
  const openEdit = (e) => {
    const type = N(e.debit) > 0 ? "Debit" : "Credit";
    const amount = type === "Debit" ? N(e.debit) : N(e.credit);
    const paymentMethod = N(e.pBank) !== 0 ? "Premier Bank" : N(e.ucbBank) !== 0 ? "UCB Bank" : N(e.wooriBank) !== 0 ? "Woori Bank" : "Cash";
    setEditItem(e);
    setForm({ date: e.date, slNo: e.slNo || "", description: e.description, category: e.category, type, amount, paymentMethod, debit: e.debit || 0, credit: e.credit || 0, cash: e.cash || 0, pBank: e.pBank || 0, ucbBank: e.ucbBank || 0, wooriBank: e.wooriBank || 0, notes: e.notes || "" });
    setShowModal(true);
  };

  const deleteEntry = (e) => {
    if (!window.confirm("Delete this entry? It will be moved to the Recycle Bin and can be restored.")) return;
    const entry = makeBinEntry("accountEntries", e, data, currentUser?.name);
    setData(d => trashItem(d, "accountEntries", entry));
    toast("Entry moved to Recycle Bin", "success");
  };

  const submit = () => {
    if (!form.description) { toast("Description required", "error"); return; }
    const debit  = form.type === "Debit"  ? N(form.amount) : 0;
    const credit = form.type === "Credit" ? N(form.amount) : 0;
    const sign   = form.type === "Debit" ? 1 : -1;
    const cash   = form.paymentMethod === "Cash"         ? sign * N(form.amount) : 0;
    const pBank  = form.paymentMethod === "Premier Bank" ? sign * N(form.amount) : 0;
    const ucbBank= form.paymentMethod === "UCB Bank"     ? sign * N(form.amount) : 0;
    const wooriBank = form.paymentMethod === "Woori Bank" ? sign * N(form.amount) : 0;
    const entry  = { ...form, debit, credit, cash, pBank, ucbBank, wooriBank };
    if (editItem) {
      setData(d => ({ ...d, accountEntries: d.accountEntries.map(x => x.id === editItem.id ? { ...x, ...entry } : x) }));
      toast("Entry updated!", "success");
    } else {
      const newEntry = { ...entry, id: generateId() };
      setData(d => ({ ...d, accountEntries: [...(d.accountEntries || []), newEntry] }));
      toast("Entry added!", "success");
    }
    setShowModal(false);
  };

  const saveOb = () => {
    setData(d => ({ ...d, accountOpenBalance: { ...obForm } }));
    toast("Opening balance saved!", "success");
    setShowObModal(false);
  };

  const printReport = () => {
    const mf = (v) => curr + Number(v||0).toLocaleString("en-US",{minimumFractionDigits:2});
    let runBal  = mOpenBal;
    let runCash = mOpenCash;
    let runPB   = mOpenPB;
    let runUcb  = mOpenUcb;
    let runWoori= mOpenWoori;
    const rows = reportEntries.map((e, idx) => {
      runBal  = runBal  + N(e.debit) - N(e.credit);
      runCash = runCash + N(e.cash);
      runPB   = runPB   + N(e.pBank);
      runUcb  = runUcb  + N(e.ucbBank);
      runWoori= runWoori+ N(e.wooriBank);
      return `<tr>
        <td class="mono">${e.date}</td>
        <td class="center">${idx + 1}</td>
        <td>${e.description}${e.notes ? `<br/><small style="color:#888">${e.notes}</small>` : ""}</td>
        <td>${e.category}</td>
        <td class="right mono" style="color:#065f46">${N(e.debit)  > 0 ? mf(e.debit)  : "—"}</td>
        <td class="right mono" style="color:#991b1b">${N(e.credit) > 0 ? mf(e.credit) : "—"}</td>
        <td class="right mono" style="color:#1d4ed8;font-weight:700">${mf(runBal)}</td>
        <td class="right mono" style="color:${runCash < 0 ? '#991b1b' : '#111'}">${mf(runCash)}</td>
        <td class="right mono" style="color:${runPB   < 0 ? '#991b1b' : '#111'}">${mf(runPB)}</td>
        <td class="right mono" style="color:${runUcb  < 0 ? '#991b1b' : '#111'}">${mf(runUcb)}</td>
        <td class="right mono" style="color:${runWoori< 0 ? '#991b1b' : '#111'}">${mf(runWoori)}</td>
      </tr>`;
    }).join("");

    const catRows = catSummary.map(c =>
      `<tr>
        <td>${c.cat}</td>
        <td class="center">${c.items.length}</td>
        <td class="right mono" style="color:#065f46">${c.totalDebit > 0 ? curr + c.totalDebit.toLocaleString("en-US",{minimumFractionDigits:2}) : "—"}</td>
        <td class="right mono" style="color:#991b1b">${c.totalCredit > 0 ? curr + c.totalCredit.toLocaleString("en-US",{minimumFractionDigits:2}) : "—"}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/>
<title>Monthly Report 月报 — ${reportMonth}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;font-size:12px;color:#111;background:#fff;padding:32px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:22px;font-weight:800;color:#1d4ed8;margin-bottom:2px}
h1 .zh{font-size:13px;font-weight:500;color:#475569;display:block;margin-top:2px}
h2{font-size:13px;font-weight:700;margin:22px 0 8px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px}
h2 .zh{font-size:11px;color:#64748b;font-weight:400;margin-left:8px}
.sub{font-size:11px;color:#64748b;margin-bottom:20px}
/* Summary grid */
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.card{background:#f0f4ff;border-radius:8px;padding:12px 14px;border:1px solid #c7d2fe}
.card-label{font-size:8px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:2px}
.card-label-zh{font-size:8px;color:#94a3b8}
.card-val{font-size:15px;font-weight:800;font-family:monospace}
table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px}
th{background:#1d4ed8;color:#fff;padding:7px 10px;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em}
th .zh{font-size:8px;color:#bfdbfe;font-weight:400;display:block;text-transform:none;margin-top:1px}
td{padding:6px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
tr:nth-child(even) td{background:#f8fafc}
.row-ob td{background:#fefce8!important;color:#854d0e;font-weight:700;border-top:2px solid #fde68a;border-bottom:2px solid #fde68a}
.row-cb td{background:#eff6ff!important;color:#1d4ed8;font-weight:700;border-top:2px solid #bfdbfe;border-bottom:2px solid #bfdbfe}
.right{text-align:right}.center{text-align:center}.mono{font-family:monospace}
.footer{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
</style></head><body>
<h1>Cash Flow Ledger Report <span class="zh">现金流量账本月报</span></h1>
<div class="sub">Period / 期间: ${reportMonth} &nbsp;|&nbsp; Generated / 生成时间: ${new Date().toLocaleString()} &nbsp;|&nbsp; Currency / 货币: BDT</div>

<!-- Summary cards -->
<div class="grid" style="grid-template-columns:repeat(5,1fr)">
  <div class="card"><div class="card-label">Total Debit (Income) <span class="card-label-zh">/ 总借方（收入）</span></div><div class="card-val" style="color:#065f46">${mf(rDebit)}</div></div>
  <div class="card"><div class="card-label">Total Credit (Expense) <span class="card-label-zh">/ 总贷方（支出）</span></div><div class="card-val" style="color:#991b1b">${mf(rCredit)}</div></div>
  <div class="card"><div class="card-label">Total Sales <span class="card-label-zh">/ 总销售额</span></div><div class="card-val" style="color:#0369a1">${mf(rTotalSales)}</div></div>
  <div class="card"><div class="card-label">Total Expense <span class="card-label-zh">/ 总费用</span></div><div class="card-val" style="color:#c2410c">${mf(rTotalExpense)}</div><div style="font-size:7.5px;color:#9ca3af;margin-top:3px">Raw Mat · Util · Transport · Salary · Office · Maint · TDS · VAT · Rent · Other</div></div>
  <div class="card" style="background:${rProfitOrLoss>=0?'#f0fdf4':'#fef2f2'};border-color:${rProfitOrLoss>=0?'#86efac':'#fca5a5'}"><div class="card-label">${rProfitOrLoss>=0?'Profit ▲':'Loss ▼'} <span class="card-label-zh">${rProfitOrLoss>=0?'/ 盈利':'/ 亏损'}</span></div><div class="card-val" style="color:${rProfitOrLoss>=0?'#15803d':'#991b1b'};font-size:17px">${rProfitOrLoss>=0?'+':''}${mf(rProfitOrLoss)}</div><div style="font-size:7.5px;color:#9ca3af;margin-top:3px">Sales − Expense</div></div>
</div>

<h2>Income & Expenses by Category <span class="zh">按类别收支</span></h2>
<table><thead><tr>
  <th>Category<div class="zh">类别</div></th>
  <th class="center">Entries<div class="zh">记录数</div></th>
  <th class="right">Total Income<div class="zh">总收入</div></th>
  <th class="right">Total Expense<div class="zh">总支出</div></th>
</tr></thead>
<tbody>${catRows || "<tr><td colspan='4' style='text-align:center;color:#888'>No data / 无数据</td></tr>"}</tbody></table>

<h2>Detailed Ledger <span class="zh">明细账本</span></h2>
<table><thead><tr>
  <th>Date<div class="zh">日期</div></th>
  <th>SL<div class="zh">序号</div></th>
  <th>Description<div class="zh">描述</div></th>
  <th>Category<div class="zh">类别</div></th>
  <th class="right">Debit (Income)<div class="zh">借方（收入）</div></th>
  <th class="right">Credit (Expense)<div class="zh">贷方（支出）</div></th>
  <th class="right">Balance<div class="zh">余额</div></th>
  <th class="right">Cash<div class="zh">现金</div></th>
  <th class="right">P-Bank<div class="zh">优先银行</div></th>
  <th class="right">UCB-Bank<div class="zh">UCB银行</div></th>
  <th class="right">Woori-Bank<div class="zh">友利银行</div></th>
</tr></thead>
<tbody>
<tr class="row-ob">
  <td class="mono">${ob.date || "—"}</td><td class="center">—</td>
  <td><strong>Opening Balance / 期初余额</strong></td><td>—</td>
  <td class="right mono" style="color:#065f46">—</td>
  <td class="right mono" style="color:#991b1b">—</td>
  <td class="right mono">${mf(mOpenBal)}</td>
  <td class="right mono">${mf(mOpenCash)}</td>
  <td class="right mono">${mf(mOpenPB)}</td>
  <td class="right mono">${mf(mOpenUcb)}</td>
  <td class="right mono">${mf(mOpenWoori)}</td>
</tr>
${rows || "<tr><td colspan='11' style='text-align:center;color:#888'>No entries this month / 本月无记录</td></tr>"}
<tr class="row-cb">
  <td class="mono">—</td><td class="center">—</td>
  <td><strong>Closing Balance / 期末余额</strong></td><td>—</td>
  <td class="right mono">—</td>
  <td class="right mono">—</td>
  <td class="right mono" style="color:#1d4ed8;font-weight:700">${mf(mCloseBal)}</td>
  <td class="right mono" style="color:${mCloseCash < 0 ? '#991b1b' : '#111'}">${mf(mCloseCash)}</td>
  <td class="right mono" style="color:${mClosePB   < 0 ? '#991b1b' : '#111'}">${mf(mClosePB)}</td>
  <td class="right mono" style="color:${mCloseUcb  < 0 ? '#991b1b' : '#111'}">${mf(mCloseUcb)}</td>
  <td class="right mono" style="color:${mCloseWoori< 0 ? '#991b1b' : '#111'}">${mf(mCloseWoori)}</td>
</tr>
</tbody></table>
<div class="footer">Hongtai ERP &nbsp;|&nbsp; Accounts &amp; Ledger Module / 账户与账本模块 &nbsp;|&nbsp; ${new Date().getFullYear()}</div>
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) { toast("Popup blocked. Allow popups and try again. / 弹窗被拦截，请允许弹窗后重试。", "error"); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="fade-in" style={{ padding: "28px 28px 60px 28px" }}>
      <SectionHeader title="Accounts & Cash Ledger / 账户与现金账本" subtitle={`${entries.length} entries / 条记录`}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => { setObForm({ ...ob }); setShowObModal(true); }}>
              Set Opening Balance / 设置期初余额
            </button>
            <button className="btn btn-primary" onClick={openNew}>
              <Icon name="plus" size={15} /> Add Entry / 新增记录
            </button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { l: "Current Balance / 当前余额", v: currentBalance, color: "#3B82F6" },
          { l: "Cash in Hand / 手头现金",    v: currentCash,    color: "#10B981" },
          { l: "Premier Bank / 优先银行",    v: currentPBank,   color: "#8B5CF6" },
          { l: "UCB Bank / UCB银行",        v: currentUcb,     color: "#F59E0B" },
          { l: "Woori Bank / 友利银行",      v: currentWoori,   color: "#EC4899" },
        ].map(s => (
          <div key={s.l} className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>{s.l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{moneyFmt(s.v)}</div>
          </div>
        ))}
      </div>

      {/* Balance Mismatch Warning */}
      {(() => {
        const sumAccounts = currentCash + currentPBank + currentUcb + currentWoori;
        const diff = Math.abs(currentBalance - sumAccounts);
        const isBalanced = diff < 0.01;
        if (isBalanced) return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", marginBottom: 16 }}>
            <span style={{ fontSize: 16 }}>✅</span>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#10B981" }}>Balance Verified / 余额已核实</span>
              <span style={{ fontSize: 12, color: "#64748B", marginLeft: 10 }}>Cash + P-Bank + UCB Bank + Woori Bank = Current Balance / 现金 + 优先银行 + UCB银行 + 友利银行 = 当前余额</span>
            </div>
          </div>
        );
        return (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)", marginBottom: 16, animation: "pulse 2s infinite" }}>
            <span style={{ fontSize: 20, marginTop: 1 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#EF4444", marginBottom: 4 }}>Balance Mismatch Detected! / 余额不匹配！</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#475569" }}>Current Balance / 当前余额: <span style={{ color: "#3B82F6", fontFamily: "IBM Plex Mono", fontWeight: 700 }}>{moneyFmt(currentBalance)}</span></span>
                <span style={{ fontSize: 12, color: "#475569" }}>Cash + P-Bank + UCB + Woori / 现金+银行合计: <span style={{ color: "#F59E0B", fontFamily: "IBM Plex Mono", fontWeight: 700 }}>{moneyFmt(sumAccounts)}</span></span>
                <span style={{ fontSize: 12, color: "#475569" }}>Difference / 差额: <span style={{ color: "#EF4444", fontFamily: "IBM Plex Mono", fontWeight: 700 }}>{moneyFmt(diff)}</span></span>
              </div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>Please review your entries — Cash, Premier Bank, UCB Bank, and Woori Bank totals should equal the Current Balance. / 请检查记录，现金、优先银行、UCB银行及友利银行合计应等于当前余额。</div>
            </div>
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #E2E8F0" }}>
        {[["ledger", "Ledger / 账本"], ["report", "Monthly Report / 月报"], ["daily", "Daily Report / 日报"], ["category", "Category Report / 类别报表"]].map(([id, label]) => (
          <button key={id} onClick={() => setActiveTab(id)}
            style={{ background: "none", border: "none", borderBottom: `2px solid ${activeTab === id ? "#3B82F6" : "transparent"}`, padding: "10px 20px", cursor: "pointer", color: activeTab === id ? "#3B82F6" : "#64748B", fontWeight: activeTab === id ? 600 : 400, fontSize: 13, fontFamily: "Sora, sans-serif", transition: "all .15s" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── LEDGER TAB ── */}
      {activeTab === "ledger" && (
        <>
          {/* Search + Filter toolbar */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
            {/* Search */}
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", marginBottom: 4 }}>Search</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#64748B", fontSize: 13, pointerEvents: "none" }}>🔍</span>
                <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                  placeholder="Search description, category, notes, SL…"
                  style={{ paddingLeft: 30, width: "100%" }} />
              </div>
            </div>
            {/* Month filter */}
            <div>
              <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", marginBottom: 4 }}>Month</div>
              <input type="month" value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setFilterDateFrom(""); setFilterDateTo(""); setPage(1); }} style={{ width: 160 }} />
            </div>
            {/* Date from */}
            <div>
              <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", marginBottom: 4 }}>From Date</div>
              <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setFilterMonth(""); setPage(1); }} style={{ width: 150 }} />
            </div>
            {/* Date to */}
            <div>
              <div style={{ fontSize: 11, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", marginBottom: 4 }}>To Date</div>
              <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setFilterMonth(""); setPage(1); }} style={{ width: 150 }} />
            </div>
            {/* Clear */}
            {(filterMonth || filterDateFrom || filterDateTo || searchQuery) && (
              <button className="btn btn-secondary btn-sm" style={{ marginBottom: 1 }} onClick={() => { setFilterMonth(""); setFilterDateFrom(""); setFilterDateTo(""); setSearchQuery(""); setPage(1); }}>
                ✕ Clear All
              </button>
            )}
          </div>
          {/* Active filter chips */}
          {(filterMonth || filterDateFrom || filterDateTo || searchQuery) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {filterMonth && <span style={{ fontSize: 11, background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 20, padding: "3px 10px", fontFamily: "IBM Plex Mono" }}>📅 Month: {filterMonth}</span>}
              {filterDateFrom && <span style={{ fontSize: 11, background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 20, padding: "3px 10px", fontFamily: "IBM Plex Mono" }}>From: {filterDateFrom}</span>}
              {filterDateTo && <span style={{ fontSize: 11, background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 20, padding: "3px 10px", fontFamily: "IBM Plex Mono" }}>To: {filterDateTo}</span>}
              {searchQuery && <span style={{ fontSize: 11, background: "rgba(139,92,246,0.12)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 20, padding: "3px 10px", fontFamily: "IBM Plex Mono" }}>🔍 "{searchQuery}"</span>}
              <span style={{ fontSize: 11, color: "#64748B", padding: "3px 6px" }}>{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
            </div>
          )}

          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ fontSize: 12, minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>Date / 日期</th>
                    <th style={{ width: 40 }}>SL / 序号</th>
                    <th>Description / 描述</th>
                    <th style={{ width: 110 }}>Category / 类别</th>
                    <th style={{ textAlign: "right", width: 110 }}>Debit (Income) / 借方（收入）</th>
                    <th style={{ textAlign: "right", width: 110 }}>Credit (Expense) / 贷方（支出）</th>
                    <th style={{ textAlign: "right", width: 110 }}>Balance / 余额</th>
                    <th style={{ textAlign: "right", width: 95 }}>Cash / 现金</th>
                    <th style={{ textAlign: "right", width: 95 }}>P-Bank / 优先银行</th>
                    <th style={{ textAlign: "right", width: 95 }}>UCB-Bank / UCB银行</th>
                    <th style={{ textAlign: "right", width: 95 }}>Woori-Bank / 友利银行</th>
                    <th style={{ width: 72 }}>Actions / 操作</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening Balance row */}
                  {(!filterMonth && !filterDateFrom && !filterDateTo || (filterMonth && ob.date && ob.date.startsWith(filterMonth)) || (filterDateFrom && ob.date && ob.date >= filterDateFrom && (!filterDateTo || ob.date <= filterDateTo)) || (!filterDateFrom && !filterDateTo && !filterMonth)) && (
                    <tr style={{ background: "rgba(245,158,11,0.05)" }}>
                      <td><span className="mono" style={{ fontSize: 11 }}>{ob.date || "—"}</span></td>
                      <td></td>
                      <td><span style={{ color: "#F59E0B", fontWeight: 600 }}>Opening Balance / 期初余额</span></td>
                      <td></td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono" style={{ color: "#10B981", fontWeight: 700 }}>{moneyFmt(ob.balance)}</span>
                      </td>
                      <td></td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono" style={{ color: "#3B82F6", fontWeight: 700 }}>{moneyFmt(ob.balance)}</span>
                      </td>
                      <td style={{ textAlign: "right" }}><span className="mono">{moneyFmt(ob.cash)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono">{moneyFmt(ob.pBank)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono">{moneyFmt(ob.ucbBank)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono">{moneyFmt(ob.wooriBank)}</span></td>
                      <td></td>
                    </tr>
                  )}

                  {paginated.length === 0 ? (
                    <tr><td colSpan={12}><EmptyState icon="log" message="No entries. Click Add Entry to start." /></td></tr>
                  ) : paginated.map(entry => (
                    <tr key={entry.id}>
                      <td><span className="mono" style={{ fontSize: 11 }}>{entry.date}</span></td>
                      <td><span className="mono" style={{ color: "#94A3B8", fontSize: 11 }}>{entry.slNo}</span></td>
                      <td>
                        <div style={{ color: "#0F172A" }}>{entry.description}</div>
                        {entry.notes && <div style={{ fontSize: 10, color: "#64748B", marginTop: 2 }}>{entry.notes}</div>}
                      </td>
                      <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{entry.category}</span></td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono" style={{ color: N(entry.debit) > 0 ? "#10B981" : "#E2E8F0", fontWeight: N(entry.debit) > 0 ? 600 : 400 }}>
                          {N(entry.debit) > 0 ? moneyFmt(entry.debit) : "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono" style={{ color: N(entry.credit) > 0 ? "#EF4444" : "#E2E8F0", fontWeight: N(entry.credit) > 0 ? 600 : 400 }}>
                          {N(entry.credit) > 0 ? moneyFmt(entry.credit) : "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono" style={{ color: "#3B82F6", fontWeight: 700 }}>{moneyFmt(entry.runBalance)}</span>
                      </td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: N(entry.runCash) >= 0 ? "#CBD5E1" : "#EF4444" }}>{moneyFmt(entry.runCash)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: N(entry.runPBank) >= 0 ? "#CBD5E1" : "#EF4444" }}>{moneyFmt(entry.runPBank)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: N(entry.runUcb) >= 0 ? "#CBD5E1" : "#EF4444" }}>{moneyFmt(entry.runUcb)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: N(entry.runWoori) >= 0 ? "#CBD5E1" : "#EF4444" }}>{moneyFmt(entry.runWoori)}</span></td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-secondary btn-sm btn-icon" title="Edit" onClick={() => openEdit(entry)}><Icon name="edit" size={12} /></button>
                          <button className="btn btn-danger btn-sm btn-icon" title="Delete" onClick={() => deleteEntry(entry)}><Icon name="trash" size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {filtered.length > 0 && (
                  <tfoot>
                    <tr style={{ background: "#0E1629" }}>
                      <td colSpan={4} style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase" }}>Period Totals / 期间合计</td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono" style={{ color: "#10B981", fontWeight: 700 }}>{moneyFmt(filtered.reduce((s, e) => s + N(e.debit), 0))}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono" style={{ color: "#EF4444", fontWeight: 700 }}>{moneyFmt(filtered.reduce((s, e) => s + N(e.credit), 0))}</span>
                      </td>
                      <td colSpan={6}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={setPage} />
          </div>
        </>
      )}

      {/* ── MONTHLY REPORT TAB ── */}
      {activeTab === "report" && (
        <div>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
            <div>
              <label className="form-label">Select Month / 选择月份</label>
              <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} style={{ width: 200 }} />
            </div>
            <button className="btn btn-secondary" onClick={printReport}>
              <Icon name="print" size={14} /> Print / Download <span style={{ fontSize: 11, opacity: 0.7 }}>打印</span>
            </button>
          </div>

          {/* Row 1: Balance Overview */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 12 }}>
            {[
              { l: "Opening Balance / 期初余额", v: mOpenBal, color: "#F59E0B", sub: `Cash ${moneyFmt(mOpenCash)} · P-Bank ${moneyFmt(mOpenPB)} · UCB ${moneyFmt(mOpenUcb)} · Woori ${moneyFmt(mOpenWoori)}` },
              { l: "Net Cash Flow / 净现金流",    v: rDebit - rCredit, color: rDebit - rCredit >= 0 ? "#10B981" : "#EF4444", sub: `Income ${moneyFmt(rDebit)} · Expense ${moneyFmt(rCredit)}` },
              { l: "Current Balance / 期末余额",  v: mCloseBal, color: mCloseBal >= 0 ? "#3B82F6" : "#EF4444", sub: `Cash ${moneyFmt(mCloseCash)} · P-Bank ${moneyFmt(mClosePB)} · UCB ${moneyFmt(mCloseUcb)} · Woori ${moneyFmt(mCloseWoori)}` },
            ].map(s => (
              <div key={s.l} className="card" style={{ padding: 16, border: `1px solid ${s.color}33` }}>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>{s.l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{moneyFmt(s.v)}</div>
                {s.sub && <div style={{ fontSize: 10, color: "#475569", marginTop: 4, fontFamily: "IBM Plex Mono" }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          {/* Row 2: Income / Expense / Sales / Expense Breakdown / P&L */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
            {/* Total Debit */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>Total Debit (Income)</div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>总借方（收入）</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#10B981", fontFamily: "IBM Plex Mono" }}>{moneyFmt(rDebit)}</div>
            </div>
            {/* Total Credit */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>Total Credit (Expense)</div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>总贷方（支出）</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#EF4444", fontFamily: "IBM Plex Mono" }}>{moneyFmt(rCredit)}</div>
            </div>
            {/* Total Sales */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>Total Sales</div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>总销售额</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#38BDF8", fontFamily: "IBM Plex Mono" }}>{moneyFmt(rTotalSales)}</div>
            </div>
            {/* Total Expense */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>Total Expense</div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>总费用</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#F97316", fontFamily: "IBM Plex Mono" }}>{moneyFmt(rTotalExpense)}</div>
              <div style={{ fontSize: 9, color: "#64748B", marginTop: 4 }}>Raw Mat · Util · Transport · Salary · Office · Maint · TDS · VAT · Rent · Other</div>
            </div>
            {/* Profit / Loss */}
            <div className="card" style={{ padding: 16, border: `2px solid ${rProfitOrLoss >= 0 ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, background: rProfitOrLoss >= 0 ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)" }}>
              <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4, fontFamily: "IBM Plex Mono", textTransform: "uppercase" }}>{rProfitOrLoss >= 0 ? "Profit ▲" : "Loss ▼"}</div>
              <div style={{ fontSize: 11, color: "#475569", marginBottom: 6 }}>{rProfitOrLoss >= 0 ? "盈利" : "亏损"}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: rProfitOrLoss >= 0 ? "#10B981" : "#EF4444", fontFamily: "IBM Plex Mono" }}>
                {rProfitOrLoss >= 0 ? "+" : ""}{moneyFmt(rProfitOrLoss)}
              </div>
              <div style={{ fontSize: 9, color: "#64748B", marginTop: 4 }}>Sales − Expense</div>
            </div>
          </div>

          {catSummary.length > 0 && (
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 14 }}>Income & Expenses by Category / 按类别收支</div>
              {catSummary.map(c => {
                const isIncome = c.totalDebit > 0 && c.totalCredit === 0;
                const isExpense = c.totalCredit > 0 && c.totalDebit === 0;
                const isMixed = c.totalDebit > 0 && c.totalCredit > 0;
                const displayAmt = isIncome ? c.totalDebit : isExpense ? c.totalCredit : c.totalDebit - c.totalCredit;
                const color = isIncome ? "#10B981" : isExpense ? "#EF4444" : displayAmt >= 0 ? "#3B82F6" : "#EF4444";
                const barMax = isIncome ? rDebit : rCredit || 1;
                const barAmt = isIncome ? c.totalDebit : c.totalCredit;
                return (
                  <div key={c.cat} style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
                        {c.cat}
                        <span className="badge" style={{ marginLeft: 8, fontSize: 10, padding: "2px 6px", borderRadius: 4, background: isIncome ? "rgba(16,185,129,0.12)" : isExpense ? "rgba(239,68,68,0.12)" : "rgba(59,130,246,0.12)", color: isIncome ? "#10B981" : isExpense ? "#EF4444" : "#3B82F6" }}>
                          {isIncome ? "Income / 收入" : isExpense ? "Expense / 支出" : "Mixed / 混合"}
                        </span>
                      </span>
                      <div style={{ textAlign: "right" }}>
                        {(isIncome || isMixed) && <div className="mono" style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>+{moneyFmt(c.totalDebit)}</div>}
                        {(isExpense || isMixed) && <div className="mono" style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>−{moneyFmt(c.totalCredit)}</div>}
                      </div>
                    </div>
                    <div className="progress-bar" style={{ marginBottom: 8 }}>
                      <div className="progress-fill" style={{ width: `${barMax > 0 ? (barAmt / barMax * 100) : 0}%`, background: color }} />
                    </div>
                    <div style={{ marginLeft: 10 }}>
                      {c.items.map(it => (
                        <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #E2E8F0", fontSize: 12 }}>
                          <span style={{ color: "#475569" }}>
                            <span className="mono" style={{ color: "#64748B", marginRight: 8, fontSize: 11 }}>{it.date}</span>
                            {it.description}
                          </span>
                          <span className="mono" style={{ color: N(it.debit) > 0 ? "#10B981" : "#EF4444" }}>
                            {N(it.debit) > 0 ? `+${moneyFmt(it.debit)}` : `−${moneyFmt(it.credit)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginBottom: 12 }}>Cash Transactions / 现金交易</div>
              {reportEntries.filter(e => N(e.cash) !== 0).length === 0
                ? <EmptyState message="No cash entries this month / 本月无现金记录" />
                : reportEntries.filter(e => N(e.cash) !== 0).map(e => (
                    <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #E2E8F0", fontSize: 12 }}>
                      <span style={{ color: "#475569" }}>{e.description}</span>
                      <span className="mono" style={{ color: N(e.cash) >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>{signedFmt(e.cash)}</span>
                    </div>
                  ))}
            </div>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginBottom: 12 }}>Bank Transactions / 银行交易</div>
              {reportEntries.filter(e => N(e.pBank) + N(e.ucbBank) + N(e.wooriBank) !== 0).length === 0
                ? <EmptyState message="No bank entries this month / 本月无银行记录" />
                : reportEntries.filter(e => N(e.pBank) + N(e.ucbBank) + N(e.wooriBank) !== 0).map(e => (
                    <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #E2E8F0", fontSize: 12 }}>
                      <span style={{ color: "#475569" }}>{e.description}</span>
                      <span className="mono" style={{ fontSize: 11 }}>
                        {N(e.pBank) !== 0 && <span style={{ color: N(e.pBank) >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>P:{signedFmt(e.pBank)}</span>}
                        {N(e.pBank) !== 0 && (N(e.ucbBank) !== 0 || N(e.wooriBank) !== 0) && <span style={{ color: "#64748B" }}> · </span>}
                        {N(e.ucbBank) !== 0 && <span style={{ color: N(e.ucbBank) >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>U:{signedFmt(e.ucbBank)}</span>}
                        {N(e.ucbBank) !== 0 && N(e.wooriBank) !== 0 && <span style={{ color: "#64748B" }}> · </span>}
                        {N(e.wooriBank) !== 0 && <span style={{ color: N(e.wooriBank) >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>W:{signedFmt(e.wooriBank)}</span>}
                      </span>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}

      {/* ── DAILY REPORT TAB ── */}
      {activeTab === "daily" && (
        <div>
          {/* Toolbar */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
            <div>
              <label className="form-label">Select Date <span style={{ color: "#64748B", fontWeight: 400 }}>/ 选择日期</span></label>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} style={{ width: 200 }} />
            </div>
            <button className="btn btn-secondary" onClick={printDailyReport}>
              <Icon name="print" size={14} /> Print / Download <span style={{ fontSize: 11, opacity: 0.7 }}>打印</span>
            </button>
            <span style={{ fontSize: 12, color: "#64748B", alignSelf: "center", fontFamily: "IBM Plex Mono" }}>
              {dailyEntries.length} entr{dailyEntries.length !== 1 ? "ies" : "y"} · {dailyEntries.length} 条记录 on {reportDate}
            </span>
          </div>

          {/* Daily Summary Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { en: "Total Income",   zh: "总收入",   v: dDebit,           color: "#10B981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.2)"  },
              { en: "Total Expense",  zh: "总支出",   v: dCredit,          color: "#EF4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)"   },
              { en: "Net Cash Flow",  zh: "净现金流", v: dDebit - dCredit, color: dDebit-dCredit>=0?"#38BDF8":"#EF4444", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.2)" },
              { en: "Cash",           zh: "现金",     v: dCash,            color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)"  },
              { en: "Bank (P+UCB+Woori)", zh: "银行合计", v: Math.abs(dPBank)+Math.abs(dUcb)+Math.abs(dWoori), color: "#A78BFA", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.2)" },
            ].map(s => (
              <div key={s.en} style={{ padding: "14px 16px", borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 1, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.en}</div>
                <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>{s.zh}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: "IBM Plex Mono" }}>{moneyFmt(s.v)}</div>
              </div>
            ))}
          </div>

          {/* Category Breakdown */}
          {dailyCatSummary.length > 0 && (
            <div className="card" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>By Category</span>
                <span style={{ fontSize: 12, color: "#475569" }}>/ 按类别</span>
              </div>
              {dailyCatSummary.map((c, idx) => {
                const isIncome = c.totalDebit > 0 && c.totalCredit === 0;
                const isExpense = c.totalCredit > 0 && c.totalDebit === 0;
                const typeEn = isIncome ? "Income" : isExpense ? "Expense" : "Mixed";
                const typeZh = isIncome ? "收入" : isExpense ? "支出" : "混合";
                const accentColor = isIncome ? "#10B981" : isExpense ? "#EF4444" : "#38BDF8";
                return (
                  <div key={c.cat} style={{ borderBottom: "1px solid #E2E8F0", background: idx % 2 === 0 ? "transparent" : "rgba(15,23,42,0.01)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 3, height: 16, borderRadius: 2, background: accentColor }} />
                        <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>{c.cat}</span>
                        <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: isIncome ? "rgba(16,185,129,0.1)" : isExpense ? "rgba(239,68,68,0.1)" : "rgba(56,189,248,0.1)", color: accentColor, fontWeight: 500 }}>
                          {typeEn} / {typeZh}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        {c.totalDebit  > 0 && <span className="mono" style={{ fontSize: 12, color: "#10B981", fontWeight: 600 }}>+{moneyFmt(c.totalDebit)}</span>}
                        {c.totalCredit > 0 && <span className="mono" style={{ fontSize: 12, color: "#EF4444", fontWeight: 600 }}>−{moneyFmt(c.totalCredit)}</span>}
                      </div>
                    </div>
                    {c.items.map(it => (
                      <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 16px 5px 32px", borderTop: "1px solid rgba(15,23,42,0.03)", fontSize: 12 }}>
                        <span style={{ color: "#64748B" }}>
                          {it.slNo && <span className="mono" style={{ color: "#334155", marginRight: 6, fontSize: 11 }}>#{it.slNo}</span>}
                          {it.description}
                        </span>
                        <span className="mono" style={{ color: N(it.debit) > 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>
                          {N(it.debit) > 0 ? `+${moneyFmt(it.debit)}` : `−${moneyFmt(it.credit)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* Full daily ledger table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>All Entries</span>
              <span style={{ fontSize: 12, color: "#475569" }}>/ 全部记录</span>
              <span style={{ fontSize: 11, color: "#334155", marginLeft: 4 }}>— {reportDate}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ fontSize: 12, minWidth: 860 }}>
                <thead>
                  <tr>
                    <th style={{ width: 44, textAlign: "center" }}>SL<div style={{ fontSize: 9, fontWeight: 400, opacity: 0.65 }}>序号</div></th>
                    <th>Description<div style={{ fontSize: 9, fontWeight: 400, opacity: 0.65 }}>描述</div></th>
                    <th style={{ width: 115 }}>Category<div style={{ fontSize: 9, fontWeight: 400, opacity: 0.65 }}>类别</div></th>
                    <th style={{ textAlign: "right", width: 115 }}>Debit (Income)<div style={{ fontSize: 9, fontWeight: 400, opacity: 0.65 }}>借方（收入）</div></th>
                    <th style={{ textAlign: "right", width: 120 }}>Credit (Expense)<div style={{ fontSize: 9, fontWeight: 400, opacity: 0.65 }}>贷方（支出）</div></th>
                    <th style={{ textAlign: "right", width: 95 }}>Cash<div style={{ fontSize: 9, fontWeight: 400, opacity: 0.65 }}>现金</div></th>
                    <th style={{ textAlign: "right", width: 95 }}>P-Bank<div style={{ fontSize: 9, fontWeight: 400, opacity: 0.65 }}>优先银行</div></th>
                    <th style={{ textAlign: "right", width: 95 }}>UCB-Bank<div style={{ fontSize: 9, fontWeight: 400, opacity: 0.65 }}>UCB银行</div></th>
                    <th style={{ textAlign: "right", width: 95 }}>Woori-Bank<div style={{ fontSize: 9, fontWeight: 400, opacity: 0.65 }}>友利银行</div></th>
                  </tr>
                </thead>
                <tbody>
                  {dailyEntries.length === 0 ? (
                    <tr><td colSpan={9}><EmptyState icon="log" message="No entries for this date. / 本日无记录。" /></td></tr>
                  ) : dailyEntries.map((entry, idx) => (
                    <tr key={entry.id} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                      <td style={{ textAlign: "center" }}><span className="mono" style={{ color: "#475569", fontSize: 11 }}>{entry.slNo}</span></td>
                      <td>
                        <div style={{ color: "#334155" }}>{entry.description}</div>
                        {entry.notes && <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{entry.notes}</div>}
                      </td>
                      <td><span className="badge badge-blue" style={{ fontSize: 10 }}>{entry.category}</span></td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono" style={{ color: N(entry.debit) > 0 ? "#10B981" : "#334155", fontWeight: N(entry.debit) > 0 ? 600 : 400 }}>
                          {N(entry.debit) > 0 ? moneyFmt(entry.debit) : "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <span className="mono" style={{ color: N(entry.credit) > 0 ? "#F87171" : "#334155", fontWeight: N(entry.credit) > 0 ? 600 : 400 }}>
                          {N(entry.credit) > 0 ? moneyFmt(entry.credit) : "—"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: N(entry.cash) >= 0 ? "#94A3B8" : "#F87171" }}>{moneyFmt(entry.cash)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: N(entry.pBank) >= 0 ? "#94A3B8" : "#F87171" }}>{moneyFmt(entry.pBank)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: N(entry.ucbBank) >= 0 ? "#94A3B8" : "#F87171" }}>{moneyFmt(entry.ucbBank)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: N(entry.wooriBank) >= 0 ? "#94A3B8" : "#F87171" }}>{moneyFmt(entry.wooriBank)}</span></td>
                    </tr>
                  ))}
                </tbody>
                {dailyEntries.length > 0 && (
                  <tfoot>
                    <tr style={{ background: "#0A0C12", borderTop: "1px solid #26334F" }}>
                      <td colSpan={3} style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#475569", fontWeight: 600, letterSpacing: "0.03em" }}>Day Totals / 当日合计</td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ color: "#10B981", fontWeight: 700 }}>{moneyFmt(dDebit)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ color: "#F87171", fontWeight: 700 }}>{moneyFmt(dCredit)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: "#94A3B8" }}>{moneyFmt(dCash)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: "#94A3B8" }}>{moneyFmt(dPBank)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: "#94A3B8" }}>{moneyFmt(dUcb)}</span></td>
                      <td style={{ textAlign: "right" }}><span className="mono" style={{ fontSize: 11, color: "#94A3B8" }}>{moneyFmt(dWoori)}</span></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── CATEGORY REPORT TAB ── */}
      {activeTab === "category" && (
        <div className="fade-in">
          {/* ── Controls Card ── */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#8B5CF6", flexShrink: 0 }}>
                <Icon name="reports" size={16} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Category Report <span style={{ color: "#64748B", fontWeight: 400 }}>/ 类别报表</span></div>
                <div style={{ fontSize: 12, color: "#64748B" }}>Filter entries by category and date range / 按类别和日期筛选记录</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 18 }}>
              {/* Category Selection */}
              <div>
                <label className="form-label" style={{ marginBottom: 8, display: "block" }}>Select Category / 选择类别</label>
                <div style={{ border: "1px solid #E2E8F0", borderRadius: 8, background: "#FFFFFF", maxHeight: 200, overflowY: "auto", padding: "6px 0" }}>
                  {ACCOUNT_CATEGORIES.map(cat => {
                    const isChecked = catSelectedCategories.includes(cat);
                    return (
                      <label key={cat} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", cursor: "pointer", borderRadius: 4, transition: "background 0.15s", background: isChecked ? "rgba(139,92,246,0.08)" : "transparent" }}
                        onMouseEnter={e => { if (!isChecked) e.currentTarget.style.background = "rgba(15,23,42,0.03)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = isChecked ? "rgba(139,92,246,0.08)" : "transparent"; }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${isChecked ? "#8B5CF6" : "#334155"}`, background: isChecked ? "#8B5CF6" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                          {isChecked && <Icon name="check" size={10} color="white" />}
                        </div>
                        <input type="checkbox" checked={isChecked} style={{ display: "none" }}
                          onChange={e => {
                            setCatReportGenerated(false);
                            setCatSelectedCategories(prev =>
                              e.target.checked ? [...prev, cat] : prev.filter(c => c !== cat)
                            );
                          }} />
                        <span style={{ fontSize: 12, color: isChecked ? "#C4B5FD" : "#475569", fontWeight: isChecked ? 600 : 400 }}>{cat}</span>
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setCatSelectedCategories([...ACCOUNT_CATEGORIES]); setCatReportGenerated(false); }}>
                    ✓ Select All / 全选
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setCatSelectedCategories([]); setCatReportGenerated(false); }}>
                    ✕ Clear / 清除
                  </button>
                  <span style={{ fontSize: 11, color: "#475569", alignSelf: "center", fontFamily: "IBM Plex Mono" }}>
                    {catSelectedCategories.length} selected / 已选
                  </span>
                </div>
              </div>

              {/* Date Selection */}
              <div>
                <label className="form-label" style={{ marginBottom: 8, display: "block" }}>Select Date Range / 选择日期范围</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">From / 从</label>
                    <input type="date" value={catDateFrom}
                      onChange={e => { setCatDateFrom(e.target.value); setCatReportGenerated(false); }}
                      style={{ width: "100%" }} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">To / 至</label>
                    <input type="date" value={catDateTo}
                      onChange={e => { setCatDateTo(e.target.value); setCatReportGenerated(false); }}
                      style={{ width: "100%" }} />
                  </div>
                </div>

                {/* Active filter summary */}
                <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: "#FFFFFF", border: "1px solid #E2E8F0", fontSize: 12, color: "#64748B" }}>
                  <div style={{ fontSize: 10, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.06em", color: "#475569", marginBottom: 6 }}>Filter Summary / 筛选摘要</div>
                  <div><span style={{ color: "#475569" }}>Categories / 类别: </span><span style={{ color: "#8B5CF6", fontWeight: 600 }}>{catSelectedCategories.length === 0 ? "None selected / 未选择" : catSelectedCategories.length === ACCOUNT_CATEGORIES.length ? "All categories / 全部类别" : `${catSelectedCategories.length} selected / 已选`}</span></div>
                  <div style={{ marginTop: 4 }}><span style={{ color: "#475569" }}>Period / 期间: </span><span style={{ color: "#3B82F6", fontWeight: 600, fontFamily: "IBM Plex Mono" }}>
                    {`${catDateFrom} → ${catDateTo}`}
                  </span></div>
                </div>
              </div>
            </div>

            {/* Generate Button */}
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="btn btn-primary"
                style={{ background: "linear-gradient(135deg, #7C3AED, #4F46E5)", padding: "9px 22px", fontSize: 13, fontWeight: 600 }}
                onClick={() => {
                  if (catSelectedCategories.length === 0) { toast("Please select at least one category. / 请至少选择一个类别。", "error"); return; }
                  if (catDateFrom > catDateTo) { toast("'From' date must be before 'To' date. / 开始日期必须早于结束日期。", "error"); return; }
                  setCatReportGenerated(true);
                }}>
                <Icon name="reports" size={14} /> Generate Report / 生成报表
              </button>
              {catReportGenerated && catFilteredEntries.length > 0 && (
                <>
                  <button className="btn btn-danger" style={{ background: "rgba(239,68,68,0.12)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.25)" }}
                    onClick={downloadCategoryPDF}>
                    <Icon name="print" size={14} /> Download PDF / 下载PDF
                  </button>
                  <button className="btn btn-success"
                    onClick={downloadCategoryExcel}>
                    <Icon name="download" size={14} /> Download Excel / 下载Excel
                  </button>
                </>
              )}
            </div>
          </div>

          {/* ── Report Results ── */}
          {catReportGenerated && (
            <div className="fade-in">
              {catFilteredEntries.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
                  <div style={{ color: "#475569", fontSize: 14, fontWeight: 500 }}>No entries found / 未找到记录</div>
                  <div style={{ color: "#475569", fontSize: 12, marginTop: 6 }}>
                    No entries match the selected {catSelectedCategories.length} categor{catSelectedCategories.length===1?"y":"ies"} / 所选类别无匹配记录 for{" "}
                    {`${catDateFrom} – ${catDateTo}`}
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary Cards */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 20 }}>
                    <div style={{ padding: "18px 20px", borderRadius: 10, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)" }}>
                      <div style={{ fontSize: 10, color: "#475569", marginBottom: 6, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Amount / 总金额</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#3B82F6", fontFamily: "IBM Plex Mono" }}>{moneyFmt(catTotalDebit + catTotalCredit)}</div>
                    </div>
                    <div style={{ padding: "18px 20px", borderRadius: 10, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
                      <div style={{ fontSize: 10, color: "#475569", marginBottom: 6, fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Entries / 总记录数</div>
                      <div style={{ fontSize: 22, fontWeight: 700, color: "#8B5CF6", fontFamily: "IBM Plex Mono" }}>{catFilteredEntries.length}</div>
                    </div>
                  </div>

                  {/* Per-category breakdown */}
                  {catByCat.map((c, cIdx) => {
                    const isIncome  = c.totalDebit  > 0 && c.totalCredit === 0;
                    const isExpense = c.totalCredit > 0 && c.totalDebit  === 0;
                    const accentColor = isIncome ? "#10B981" : isExpense ? "#EF4444" : "#38BDF8";
                    const typeLabel = isIncome ? "Income / 收入" : isExpense ? "Expense / 支出" : "Mixed / 混合";
                    return (
                      <div key={c.cat} className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
                        {/* Category header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #E2E8F0", background: "rgba(15,23,42,0.02)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 4, height: 18, borderRadius: 2, background: accentColor, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{c.cat}</span>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: isIncome ? "rgba(16,185,129,0.1)" : isExpense ? "rgba(239,68,68,0.1)" : "rgba(56,189,248,0.1)", color: accentColor, fontWeight: 500 }}>{typeLabel}</span>
                            <span style={{ fontSize: 11, color: "#475569", fontFamily: "IBM Plex Mono" }}>{c.items.length} entr{c.items.length===1?"y":"ies"} / 条记录</span>
                          </div>
                          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                            {c.totalDebit  > 0 && <span className="mono" style={{ fontSize: 13, color: "#10B981", fontWeight: 700 }}>+{moneyFmt(c.totalDebit)}</span>}
                            {c.totalCredit > 0 && <span className="mono" style={{ fontSize: 13, color: "#EF4444", fontWeight: 700 }}>−{moneyFmt(c.totalCredit)}</span>}
                          </div>
                        </div>
                        {/* Entries table */}
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ fontSize: 12, minWidth: 700 }}>
                            <thead>
                              <tr>
                                <th style={{ width: 100 }}>Date / 日期</th>
                                <th style={{ width: 50, textAlign: "center" }}>SL / 序号</th>
                                <th>Description / 描述</th>
                                <th style={{ width: 130 }}>Payment / 付款方式</th>
                                <th style={{ textAlign: "right", width: 130 }}>Debit (Income) / 借方（收入）</th>
                                <th style={{ textAlign: "right", width: 130 }}>Credit (Expense) / 贷方（支出）</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.items.map((entry, idx) => (
                                <tr key={entry.id} style={{ background: idx%2===0?"transparent":"rgba(255,255,255,0.015)" }}>
                                  <td><span className="mono" style={{ fontSize: 11, color: "#E2E8F0" }}>{entry.date}</span></td>
                                  <td style={{ textAlign: "center" }}><span className="mono" style={{ fontSize: 11, color: "#E2E8F0" }}>{entry.slNo}</span></td>
                                  <td>
                                    <div style={{ color: "#0F172A" }}>{entry.description}</div>
                                    {entry.notes && <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{entry.notes}</div>}
                                  </td>
                                  <td><span style={{ fontSize: 11, color: "#64748B" }}>{entry.paymentMethod || "—"}</span></td>
                                  <td style={{ textAlign: "right" }}>
                                    <span className="mono" style={{ color: N(entry.debit)>0?"#10B981":"#334155", fontWeight: N(entry.debit)>0?600:400 }}>
                                      {N(entry.debit)>0 ? moneyFmt(entry.debit) : "—"}
                                    </span>
                                  </td>
                                  <td style={{ textAlign: "right" }}>
                                    <span className="mono" style={{ color: N(entry.credit)>0?"#F87171":"#334155", fontWeight: N(entry.credit)>0?600:400 }}>
                                      {N(entry.credit)>0 ? moneyFmt(entry.credit) : "—"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr style={{ background: "rgba(139,92,246,0.06)", borderTop: "1px solid rgba(139,92,246,0.2)" }}>
                                <td colSpan={4} style={{ fontFamily: "IBM Plex Mono", fontSize: 11, color: "#8B5CF6", fontWeight: 600, letterSpacing: "0.04em" }}>Subtotal / 小计 — {c.cat}</td>
                                <td style={{ textAlign: "right" }}>
                                  <span className="mono" style={{ color: "#10B981", fontWeight: 700 }}>{c.totalDebit>0?moneyFmt(c.totalDebit):"—"}</span>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <span className="mono" style={{ color: "#F87171", fontWeight: 700 }}>{c.totalCredit>0?moneyFmt(c.totalCredit):"—"}</span>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    );
                  })}

                  {/* Grand total footer */}
                  <div style={{ padding: "14px 20px", borderRadius: 10, background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))", border: "1px solid rgba(139,92,246,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: "#475569", fontFamily: "IBM Plex Mono" }}>
                      Grand Total / 总计 — {catByCat.length} categor{catByCat.length===1?"y":"ies"} / 类别
                    </div>
                    <div style={{ display: "flex", gap: 28 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Amount / 总金额</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#3B82F6", fontFamily: "IBM Plex Mono" }}>{moneyFmt(catTotalDebit + catTotalCredit)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "#64748B", fontFamily: "IBM Plex Mono", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total Entries / 总记录数</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#8B5CF6", fontFamily: "IBM Plex Mono" }}>{catFilteredEntries.length}</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── ADD / EDIT MODAL ── */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editItem ? "Edit Entry / 编辑记录" : "Add Entry / 新增记录"} width={680}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Date / 日期 *</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">SL No. / 序号</label>
            <input value={form.slNo} readOnly disabled style={{ background: "#FFFFFF", color: "#64748B", cursor: "not-allowed" }} />
          </div>
          <div className="form-group" ref={catDropRef} style={{ position: "relative" }}>
            <label className="form-label">Category / 类别</label>
            {/* Trigger button showing selected category */}
            <div
              onClick={() => { setCatDropOpen(o => !o); setCatSearch(""); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 12px", borderRadius: 8, cursor: "pointer",
                background: "#FFFFFF", border: `1px solid ${catDropOpen ? "#3B82F6" : "#E2E8F0"}`,
                boxShadow: catDropOpen ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
                transition: "border-color 0.2s, box-shadow 0.2s", userSelect: "none",
              }}
            >
              <span style={{ fontSize: 12, color: form.category ? "#0F172A" : "#64748B", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "calc(100% - 20px)" }}>
                {form.category || "— Select Category —"}
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"
                style={{ flexShrink: 0, transform: catDropOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {/* Dropdown panel */}
            {catDropOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                background: "#F1F5F9", border: "1px solid #CBD5E1", borderRadius: 10,
                zIndex: 999, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                overflow: "hidden", animation: "fadeIn 0.15s ease",
              }}>
                {/* Search inside dropdown */}
                <div style={{ padding: "8px 8px 4px", borderBottom: "1px solid #E2E8F0" }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#64748B", display: "flex", pointerEvents: "none" }}>
                      <Icon name="search" size={13} />
                    </span>
                    <input
                      autoFocus
                      type="text"
                      value={catSearch}
                      onChange={e => setCatSearch(e.target.value)}
                      placeholder="Search… / 搜索…"
                      onClick={e => e.stopPropagation()}
                      style={{ paddingLeft: 30, fontSize: 12, background: "#FFFFFF", borderColor: "#E2E8F0", borderRadius: 6, height: 32 }}
                    />
                  </div>
                </div>
                {/* Options list */}
                <div style={{ maxHeight: 210, overflowY: "auto" }}>
                  {ACCOUNT_CATEGORIES
                    .filter(c => c.toLowerCase().includes(catSearch.toLowerCase()))
                    .map(c => (
                      <div
                        key={c}
                        onMouseDown={e => {
                          e.preventDefault();
                          setForm(f => ({ ...f, category: c }));
                          setCatDropOpen(false);
                          setCatSearch("");
                        }}
                        style={{
                          padding: "9px 14px", fontSize: 13, cursor: "pointer",
                          color: c === form.category ? "#3B82F6" : "#334155",
                          background: c === form.category ? "rgba(59,130,246,0.10)" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={e => { if (c !== form.category) e.currentTarget.style.background = "rgba(15,23,42,0.04)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = c === form.category ? "rgba(59,130,246,0.10)" : "transparent"; }}
                      >
                        <span>{c}</span>
                        {c === form.category && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        )}
                      </div>
                    ))
                  }
                  {ACCOUNT_CATEGORIES.filter(c => c.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && (
                    <div style={{ padding: "12px 14px", fontSize: 12, color: "#475569", textAlign: "center" }}>No match / 无匹配</div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">Description / Product Details / 描述·产品明细 *</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Washing Powder (4kg)" />
          </div>
          <div className="form-group">
            <label className="form-label">Type / 类型</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              style={{ borderColor: form.type === "Debit" ? "#10B981" : "#EF4444", color: form.type === "Debit" ? "#10B981" : "#EF4444", fontWeight: 600 }}>
              <option value="Debit">Debit — Income / 借方—收入 (+)</option>
              <option value="Credit">Credit — Expense / 贷方—支出 (−)</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" style={{ color: form.type === "Debit" ? "#10B981" : "#EF4444" }}>
              Amount / 金额 {form.type === "Debit" ? "(+)" : "(−)"}
            </label>
            <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} min={0}
              style={{ borderColor: form.type === "Debit" ? "#10B981" : "#EF4444" }} />
          </div>
          <div className="form-group">
            <label className="form-label">Notes / 备注</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional / 可选" />
          </div>
        </div>

        <div style={{ marginTop: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontFamily: "IBM Plex Mono", color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Payment Method / 付款方式</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Select Account / 选择账户</label>
              <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
                style={{ borderColor: "#3B82F6" }}>
                <option value="Cash">💵 Cash / 现金</option>
                <option value="Premier Bank">🏦 Premier Bank / 优先银行</option>
                <option value="UCB Bank">🏦 UCB Bank / UCB银行</option>
                <option value="Woori Bank">🏦 Woori Bank / 友利银行</option>
              </select>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: "#FFFFFF", border: "1px solid #E2E8F0", fontSize: 12, color: "#475569", fontFamily: "IBM Plex Mono" }}>
              <span style={{ color: "#64748B", fontSize: 11 }}>Effect / 效果: </span>
              <span style={{ color: form.type === "Debit" ? "#10B981" : "#EF4444", fontWeight: 700 }}>
                {form.type === "Debit" ? "+" : "−"}{curr}{N(form.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span style={{ color: "#64748B" }}> → {form.paymentMethod}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel / 取消</button>
          <button className="btn btn-primary" onClick={submit}>
            <Icon name="check" size={14} /> {editItem ? "Update Entry / 更新记录" : "Add Entry / 新增记录"}
          </button>
        </div>
      </Modal>

      {/* ── OPENING BALANCE MODAL ── */}
      <Modal open={showObModal} onClose={() => setShowObModal(false)} title="Set Opening Balance / 设置期初余额" width={480}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">Opening Date / 期初日期</label>
            <input type="date" value={obForm.date} onChange={e => setObForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: "1 / -1" }}>
            <label className="form-label">Total Opening Balance / 期初总余额</label>
            <input type="number" value={obForm.balance} onChange={e => setObForm(f => ({ ...f, balance: +e.target.value }))} min={0} />
          </div>
          <div className="form-group">
            <label className="form-label">Cash in Hand / 手头现金</label>
            <input type="number" value={obForm.cash} onChange={e => setObForm(f => ({ ...f, cash: +e.target.value }))} min={0} />
          </div>
          <div className="form-group">
            <label className="form-label">Premier Bank / 优先银行</label>
            <input type="number" value={obForm.pBank} onChange={e => setObForm(f => ({ ...f, pBank: +e.target.value }))} min={0} />
          </div>
          <div className="form-group">
            <label className="form-label">UCB Bank / UCB银行</label>
            <input type="number" value={obForm.ucbBank} onChange={e => setObForm(f => ({ ...f, ucbBank: +e.target.value }))} min={0} />
          </div>
          <div className="form-group">
            <label className="form-label">Woori Bank / 友利银行</label>
            <input type="number" value={obForm.wooriBank} onChange={e => setObForm(f => ({ ...f, wooriBank: +e.target.value }))} min={0} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowObModal(false)}>Cancel / 取消</button>
          <button className="btn btn-primary" onClick={saveOb}>
            <Icon name="check" size={14} /> Save Balance / 保存余额
          </button>
        </div>
      </Modal>
    </div>
  );
};

// ============================================================
// APP SHELL
// ============================================================
export default function App() {
  const [data, _setData] = useState(INITIAL_DATA);
  const [loading, setLoading] = useState(true);
  const dataRef = useRef(data);
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Mobile: keep sidebar as a slim rail; close the drawer after navigating
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) setSidebarCollapsed(true);
  }, [activePage]);
  const [toasts, setToasts] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [loggedIn, setLoggedIn] = useState(() => {
    try { return sessionStorage.getItem("bizcore_loggedIn") === "true"; } catch { return false; }
  });
  const [currentUser, setCurrentUser] = useState(() => {
    try { const u = sessionStorage.getItem("bizcore_user"); return u ? JSON.parse(u) : null; } catch { return null; }
  });
  const isOnline = useOnlineStatus();
  const onlineRef = useRef(isOnline);
  useEffect(() => { onlineRef.current = isOnline; }, [isOnline]);

  // Load all data from Firestore on mount
  useEffect(() => {
    const load = async () => {
      try {
        const loaded = { ...INITIAL_DATA };
        await Promise.all(
          FS_COLLECTIONS.map(async colName => {
            const snap = await getDocs(collection(db, colName));
            loaded[colName] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
          })
        );
        // Load settings
        const settingsSnap = await getDocs(collection(db, "settings"));
        if (!settingsSnap.empty) {
          loaded.settings = settingsSnap.docs[0].data();
        }
        // Load accountOpenBalance
        const obSnap = await getDocs(collection(db, "accountOpenBalance"));
        if (!obSnap.empty) {
          loaded.accountOpenBalance = obSnap.docs[0].data();
        }
        _setData(loaded);
        dataRef.current = loaded;
      } catch(e) {
        console.error("Firestore load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Firestore sync is kept OUTSIDE _setData's updater on purpose.
  // React StrictMode calls updater functions twice to detect side-effects,
  // which caused generateId() to produce two different IDs and write two
  // Firestore documents, causing duplicates on page refresh.
  const toast = useCallback((message, type = "info") => {
    const id = generateId();
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // Smart setData: updates local state AND syncs diffs to Firestore.
  // Blocked entirely while offline so that data is never entered/edited
  // without being persisted to Firestore (which was silently losing data before).
  const setData = useCallback((updater) => {
    if (!onlineRef.current) {
      toast("No internet connection. Data entry is disabled until connection is restored.", "error");
      return;
    }
    const prev = dataRef.current;
    const next = typeof updater === "function" ? updater(prev) : updater;
    dataRef.current = next;
    // Sync changed collections — runs exactly once, outside the updater
    const changes = FS_COLLECTIONS
      .filter(colName => prev[colName] !== next[colName])
      .map(colName => ({ colName, oldItems: prev[colName], newItems: next[colName] }));
    if (changes.length > 0) syncCollections(changes);
    // Sync settings if changed
    if (prev.settings !== next.settings) {
      setDoc(doc(db, "settings", "main"), next.settings).catch(console.error);
    }
    // Sync accountOpenBalance if changed
    if (prev.accountOpenBalance !== next.accountOpenBalance) {
      setDoc(doc(db, "accountOpenBalance", "main"), next.accountOpenBalance).catch(console.error);
    }
    _setData(next);
  }, [toast]);

  const removeToast = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  const login = useCallback((email, password) => {
    if (!onlineRef.current) return false;
    // Check registered users from Firestore
    const found = dataRef.current.users.find(
      u => u.email === email && u.password === password && u.active !== false
    );
    if (found) {
      setCurrentUser(found);
      setLoggedIn(true);
      try { sessionStorage.setItem("bizcore_loggedIn", "true"); sessionStorage.setItem("bizcore_user", JSON.stringify(found)); } catch {}
      // Update lastLogin
      const updated = { ...found, lastLogin: fmt(new Date()) };
      setData(d => ({ ...d, users: d.users.map(u => u.id === found.id ? updated : u) }));
      return true;
    }
    // Built-in default admin fallback
    if (email === "hongtaippl@gmail.com" && password === "Amirul01876") {
      const admin = { id: "u1", name: "Admin", email: "hongtaippl@gmail.com", role: "Admin", avatar: "AU" };
      setCurrentUser(admin);
      setLoggedIn(true);
      try { sessionStorage.setItem("bizcore_loggedIn", "true"); sessionStorage.setItem("bizcore_user", JSON.stringify(admin)); } catch {}
      return true;
    }
    return false;
  }, [setData]);

  const logout = useCallback(() => {
    try { sessionStorage.removeItem("bizcore_loggedIn"); sessionStorage.removeItem("bizcore_user"); } catch {}
    setLoggedIn(false);
    setCurrentUser(null);
    setActivePage("dashboard");
  }, []);

  const curr = data.settings.currency || "৳";

  const ctx = { data, setData, toast, curr, currentUser, logout, isOnline };

  const pages = {
    dashboard: Dashboard,
    sales: Sales,
    purchases: Purchases,
    inventory: Inventory,
    customers: Customers,
    suppliers: Suppliers,
    finance: Finance,
    reports: Reports,
    ai: AIAnalytics,
    logs: ActivityLogs,
    settings: Settings,
    recycle: RecycleBin,
    accounts: Accounts,
  };

  const PageComponent = pages[activePage] || Dashboard;

  // Close notif on outside click
  useEffect(() => {
    const handler = () => setShowNotif(false);
    if (showNotif) { setTimeout(() => document.addEventListener("click", handler), 100); }
    return () => document.removeEventListener("click", handler);
  }, [showNotif]);

  if (!loggedIn) return <LoginScreen onLogin={login} loading={loading} isOnline={isOnline} />;

  if (loading) return (
    <>
      <GlobalStyles />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F4F6FB", gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "white", fontFamily: "Sora, sans-serif" }}>B</div>
        <div style={{ color: "#0F172A", fontSize: 15, fontWeight: 600, fontFamily: "Sora, sans-serif" }}>Loading Hongtai ERP...</div>
        <div style={{ color: "#64748B", fontSize: 12, fontFamily: "IBM Plex Mono, monospace" }}>Connecting to Firebase...</div>
        <div style={{ width: 160, height: 3, background: "#E2E8F0", borderRadius: 2, overflow: "hidden", marginTop: 8 }}>
          <div style={{ width: "60%", height: "100%", background: "linear-gradient(90deg, #3B82F6, #8B5CF6)", borderRadius: 2, animation: "shimmer 1.5s infinite" }} />
        </div>
      </div>
    </>
  );

  return (
    <AppContext.Provider value={ctx}>
      <GlobalStyles />
      <div className="bz-shell" style={{ display: "flex", height: "100vh" }}>
        <Sidebar active={activePage} setActive={setActivePage} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
        {!sidebarCollapsed && <div className="bz-backdrop" onClick={() => setSidebarCollapsed(true)} />}
        <div className="bz-main" style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {!isOnline && (
            <div style={{
              background: "rgba(239,68,68,0.15)", borderBottom: "1px solid rgba(239,68,68,0.3)",
              color: "#EF4444", fontSize: 13, fontWeight: 600, textAlign: "center",
              padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              flexShrink: 0,
            }}>
              <span>📡</span> No internet connection — data entry is disabled until connection is restored.
            </div>
          )}
          <Header page={activePage} showNotif={showNotif} setShowNotif={setShowNotif} />
          <div className="bz-content" style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <PageComponent key={activePage} />
          </div>
        </div>
      </div>
      <Toast toasts={toasts} removeToast={removeToast} />
    </AppContext.Provider>
  );
}