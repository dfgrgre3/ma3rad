import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { User } from '../types';
import { NavigationService } from '../services/NavigationService';
import { useTheme } from '../contexts/ThemeContext';

interface HeaderNavProps {
  currentUser: User | null;
}

interface PanelAnchor {
  top: number;
  right: number;
  width: number;
  maxHeight: number;
}

/**
 * Horizontal main navigation used when `navigationLayout` is set to `header`.
 * Groups open as compact drop-down panels; permissions and ordering come from
 * the same NavigationService used by the side navigation.
 */
export const HeaderNav: React.FC<HeaderNavProps> = ({ currentUser }) => {
  const location = useLocation();
  const { settings } = useTheme();
  const [openId, setOpenId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<PanelAnchor | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const visibleGroups = useMemo(
    () => NavigationService.getAccessibleGroups(currentUser),
    // `settings` is part of the dependency list because navigation overrides are
    // stored in system settings and must refresh when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, settings]
  );

  const openGroup = visibleGroups.find((group) => group.id === openId) ?? null;

  useEffect(() => {
    setOpenId(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!openId) return;
    const nav = navRef.current;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (nav?.contains(target)) return;
      setOpenId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null);
    };
    const close = () => setOpenId(null);

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    nav?.addEventListener('scroll', close, { passive: true });

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      nav?.removeEventListener('scroll', close);
    };
  }, [openId]);

  const isItemActive = (to: string) =>
    location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`));

  const toggleGroup = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 16);
    const right = Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - width - 8));
    const maxHeight = Math.max(160, window.innerHeight - rect.bottom - 24);
    setAnchor({ top: rect.bottom + 4, right, width, maxHeight });
    setOpenId(id);
  };

  return (
    <nav
      ref={navRef}
      className="win-topnav hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto lg:flex"
      aria-label="التنقل الرئيسي"
    >
      {visibleGroups.map((group) => {
        if (group.items.length === 1) {
          const item = group.items[0];
          return (
            <NavLink
              key={group.id}
              to={item.to}
              title={group.label}
              className={({ isActive }) => `win-topnav-item ${isActive ? 'win-topnav-item--active' : ''}`}
            >
              <span className="truncate">{group.label}</span>
            </NavLink>
          );
        }

        const isOpen = openId === group.id;
        const hasActiveChild = group.items.some((item) => isItemActive(item.to));

        return (
          <button
            key={group.id}
            type="button"
            onClick={(event) => toggleGroup(event, group.id)}
            className={`win-topnav-item ${hasActiveChild || isOpen ? 'win-topnav-item--active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-controls={`win-topnav-panel-${group.id}`}
            title={group.label}
          >
            <span className="truncate">{group.label}</span>
          </button>
        );
      })}

      {openGroup && anchor && (
        <div
          ref={panelRef}
          id={`win-topnav-panel-${openGroup.id}`}
          role="menu"
          aria-label={openGroup.label}
          dir="rtl"
          className="win-nav-panel"
          style={{ top: anchor.top, right: anchor.right, width: anchor.width, maxHeight: anchor.maxHeight }}
        >
          <div className="win-nav-panel-head">
            <span className="truncate">{openGroup.label}</span>
          </div>
          <div className="win-nav-panel-list">
            {openGroup.items.map((item) => {
              return (
                <NavLink
                  key={item.to + item.label}
                  to={item.to}
                  role="menuitem"
                  title={item.label}
                  onClick={() => setOpenId(null)}
                  className={({ isActive }) => `win-nav-item ${isActive ? 'win-nav-item--active' : ''}`}
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge && item.badge > 0 && (
                    <span className="mr-auto min-w-[18px] rounded-[2px] bg-[#c42b1c] px-1 text-center text-[10px] font-bold leading-[16px] text-white">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
};
