import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import dpc from "../assets/dpc.png";
import {
  Code2,
  FileCode2,
  FilePenLine,
  GraduationCap,
  LogIn,
  UserPlus,
  ShieldUser,
  Trophy,
  LogOut,
  UserRound,
  Users,
  LayoutDashboard,
  ClipboardList,
  ScrollText,
  BookOpenCheck,
  Menu,
  X,
} from "lucide-react";

const MAIN_ITEMS = [
  {
    to: "/problems",
    label: "Problems",
    icon: Code2,
  },
  {
    to: "/submissions",
    label: "Submissions",
    icon: FileCode2,
  },
  {
    to: "/learn",
    label: "Learn",
    icon: GraduationCap,
  },
  {
    to: "/contests",
    label: "Contests",
    icon: Trophy,
  },
];

const ADMIN_ITEMS = [
  {
    to: "/admin/problems",
    label: "Manage Problems",
    icon: FilePenLine,
  },
  {
    to: "/admin/learning",
    label: "Learning Content",
    icon: BookOpenCheck,
  },
  {
    to: "/admin/contests",
    label: "Contest Control",
    icon: ClipboardList,
  },
  {
    to: "/admin/submissions",
    label: "Submission Review",
    icon: ScrollText,
  },
  {
    to: "/admin/users",
    label: "User Management",
    icon: Users,
  },
  {
    to: "/admin/audit-logs",
    label: "Audit Logs",
    icon: ScrollText,
  },
  {
    to: "/admin/dashboard",
    label: "Admin Dashboard",
    icon: LayoutDashboard,
  },
];

const LOGGED_OUT_ITEMS = [
  {
    to: "/login",
    label: "Login",
    icon: LogIn,
  },
  {
    to: "/register",
    label: "Register",
    icon: UserPlus,
  },
];

function readStoredUser() {
  try {
    const rawUser = localStorage.getItem("user");
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
}

function getInitials(name) {
  if (!name) return "U";

  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "U"
  );
}

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(readStoredUser);
  const [openLocationKey, setOpenLocationKey] = useState(null);

  const navbarRef = useRef(null);
  const toggleRef = useRef(null);

  // Navigation to another route automatically makes the menu closed.
  const mobileOpen = openLocationKey === location.key;

  function closeMenu() {
    setOpenLocationKey(null);
  }

  function toggleMenu() {
    setOpenLocationKey((previous) =>
      previous === location.key ? null : location.key,
    );
  }

  useEffect(() => {
    const updateUser = () => {
      setUser(readStoredUser());
      setOpenLocationKey(null);
    };

    window.addEventListener("authChanged", updateUser);
    window.addEventListener("storage", updateUser);

    return () => {
      window.removeEventListener("authChanged", updateUser);
      window.removeEventListener("storage", updateUser);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    function handleOutsidePointer(event) {
      if (!navbarRef.current?.contains(event.target)) {
        setOpenLocationKey(null);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpenLocationKey(null);
        toggleRef.current?.focus();
      }
    }

    function handleFocusOutside(event) {
      if (!navbarRef.current?.contains(event.target)) {
        setOpenLocationKey(null);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointer);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusOutside);

    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusOutside);
    };
  }, [mobileOpen]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");

    function handleBreakpointChange(event) {
      if (event.matches) {
        setOpenLocationKey(null);
      }
    }

    desktopQuery.addEventListener("change", handleBreakpointChange);

    return () => {
      desktopQuery.removeEventListener("change", handleBreakpointChange);
    };
  }, []);

  const linkClasses = ({ isActive }) =>
    [
      "flex shrink-0 items-center gap-3 rounded-2xl border",
      "px-4 py-3 text-sm font-medium transition-all duration-200",
      "focus-visible:outline-2 focus-visible:outline-offset-2",
      "focus-visible:outline-cyan-300",
      isActive
        ? "border-indigo-400/30 bg-gradient-to-br from-indigo-500/20 to-cyan-400/10 text-white shadow-[0_10px_30px_rgba(109,124,255,0.18)]"
        : "border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-slate-100",
    ].join(" ");

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    setUser(null);
    closeMenu();

    window.dispatchEvent(new Event("authChanged"));
    navigate("/login");
  }

  function renderLinks(items) {
    return items.map((item) => {
      const Icon = item.icon;

      return (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={closeMenu}
          className={linkClasses}
        >
          <Icon
            size={18}
            strokeWidth={1.8}
            aria-hidden="true"
            className="shrink-0"
          />
          <span>{item.label}</span>
        </NavLink>
      );
    });
  }

  return (
    <aside
      ref={navbarRef}
      className="relative z-50 flex w-full shrink-0 flex-col border-b border-white/10 bg-slate-950/95 p-3 backdrop-blur-xl md:h-screen md:w-64 md:overflow-hidden md:border-b-0 md:border-r md:p-5"
    >
      {/* Mobile top bar / desktop branding */}
      <div className="flex shrink-0 items-center justify-between gap-3 md:block">
        <div className="min-w-0 md:rounded-3xl md:border md:border-white/10 md:bg-white/[0.04] md:p-4 md:shadow-2xl">
          <div className="flex items-center gap-3">
            <img
              src={dpc}
              alt="DPC-OJ logo"
              className="h-10 w-10 shrink-0 rounded-xl object-cover md:h-12 md:w-12 md:rounded-2xl"
            />

            <div className="min-w-0">
              <p className="truncate text-base font-bold text-white">
                DPC-OJ
              </p>
              <p className="truncate text-xs text-slate-400">
                Future Judge Platform
              </p>
            </div>
          </div>
        </div>

        <button
          ref={toggleRef}
          type="button"
          onClick={toggleMenu}
          aria-label={
            mobileOpen ? "Close navigation" : "Open navigation"
          }
          aria-expanded={mobileOpen}
          aria-controls="navigation-panel"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-100 transition hover:border-cyan-400/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 md:hidden"
        >
          {mobileOpen ? (
            <X size={24} aria-hidden="true" />
          ) : (
            <Menu size={24} aria-hidden="true" />
          )}
        </button>
      </div>

      {/* Right-side mobile dropdown / desktop sidebar content */}
      <div
        id="navigation-panel"
        className={[
          mobileOpen ? "flex" : "hidden",
          "absolute right-3 top-full mt-2",
          "max-h-[calc(100dvh-88px)] w-80",
          "max-w-[calc(100vw-24px)]",
          "flex-col overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y",
          "rounded-2xl border border-white/10 bg-slate-950",
          "p-3 shadow-2xl",
          "[scrollbar-color:rgba(148,163,184,0.35)_transparent]",
          "[scrollbar-width:thin]",
          "md:static md:mt-0 md:flex md:min-h-0 md:max-h-none",
          "md:w-auto md:max-w-none md:flex-1 md:overflow-hidden",
          "md:rounded-none md:border-0 md:bg-transparent",
          "md:p-0 md:shadow-none",
        ].join(" ")}
      >
        <div className="shrink-0 md:mt-6 md:min-h-0 md:flex-1 md:shrink md:overflow-y-auto md:pr-1">
          <section>
            <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Navigation
            </p>

            <nav aria-label="Main navigation" className="space-y-2">
              {renderLinks(MAIN_ITEMS)}
            </nav>
          </section>

          {user?.role === "admin" && (
            <section className="mt-7">
              <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-300/70">
                Administration
              </p>

              <nav
                aria-label="Administration"
                className="space-y-2"
              >
                {renderLinks(ADMIN_ITEMS)}
              </nav>
            </section>
          )}

          {!user && (
            <section className="mt-7">
              <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Account
              </p>

              <nav
                aria-label="Account navigation"
                className="space-y-2"
              >
                {renderLinks(LOGGED_OUT_ITEMS)}
              </nav>
            </section>
          )}
        </div>

        {user && (
          <div className="mt-5 shrink-0 border-t border-white/10 pt-5">
            <p className="mb-3 px-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Account
            </p>

            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.06] p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 text-sm font-bold text-white">
                  {getInitials(user.name)}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {user.name}
                  </p>

                  <p
                    className={[
                      "text-xs font-medium capitalize",
                      user.role === "admin"
                        ? "text-cyan-300"
                        : "text-slate-400",
                    ].join(" ")}
                  >
                    {user.role || "student"}
                  </p>
                </div>
              </div>
            </div>

            <nav
              aria-label="Signed-in account navigation"
              className="mt-3 space-y-2"
            >
              <NavLink
                to="/profile"
                onClick={closeMenu}
                className={linkClasses}
              >
                <UserRound
                  size={18}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span>Profile</span>
              </NavLink>

              {user.role === "admin" && (
                <NavLink
                  to="/admin/contests"
                  onClick={closeMenu}
                  className={linkClasses}
                >
                  <ShieldUser
                    size={18}
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                  <span>Admin Control</span>
                </NavLink>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 rounded-2xl border border-transparent px-4 py-3 text-left text-sm font-medium text-slate-400 transition hover:border-rose-400/20 hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                <LogOut
                  size={18}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                <span>Logout</span>
              </button>
            </nav>
          </div>
        )}
      </div>
    </aside>
  );
}

export default Navbar;