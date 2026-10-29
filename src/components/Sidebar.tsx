import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, PanelRightClose, PanelRightOpen } from 'lucide-react';
import type { User } from '../types';
import { NavigationService } from '../services/NavigationService';
import { useTheme } from '../contexts/ThemeContext';

interface SidebarProps {
  currentUser: User | null;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  mobile?: boolean;
  onNavigate?: () => void;
}

const OPEN_GROUPS_KEY = 'sidebar_open_groups';

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  collapsed = false,
  onToggleCollapsed,
  mobile = false,
  onNavigate,
}) => {
  const location = useLocation();
  const { settings } = useTheme();
  const isCollapsed = mobile ? false : collapsed;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(OPEN_GROUPS_KEY);
      return saved ? JSON.parse(saved) : { dashboard: true };
    } catch {
      return { dashboard: true };
    }
  });

  const visibleGroups = useMemo(
    () => NavigationService.getAccessibleGroups(currentUser),
    [currentUser, settings]
  );

  // Always reveal the group that owns the current route.
  useEffect(() => {
    visibleGroups.forEach((group) => {
      const isActive = group.items.some(
        (item) => location.pathname === item.to || (item.to !== '/' && location.pathname.startsWith(`${item.to}/`))
      );
      if (isActive) setOpenGroups((prev) => (prev[group.id] ? prev : { ...prev, [group.id]: true }));
    });
  }, [location.pathname, visibleGroups]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const isItemActive = (to: string) =>
    location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`));

  return (
    <aside
      className={`win-sidebar flex h-full min-h-0 flex-col select-none ${isCollapsed ? 'w-12' : 'w-[228px]'} ${mobile ? 'w-[264px]' : ''}`}
      dir="rtl"
      aria-label="التنقل الجانبي"
    >
      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2">
        {isCollapsed
          ? visibleGroups.flatMap((group) =>
              group.items.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <NavLink
                    key={`${group.id}-${item.to}-${item.label}`}
                    to={item.to}
                    title={item.label}
                    onClick={onNavigate}
                    className={({ isActive }) => `win-nav-item justify-center !px-0 ${isActive ? 'win-nav-item--active' : ''}`}
                  >
                    <ItemIcon className="win-nav-icon" />
                  </NavLink>
                );
              })
            )
          : visibleGroups.map((group) => {
              const GroupIcon = group.icon;
              const isOpen = openGroups[group.id] ?? false;
              const hasActiveChild = group.items.some((item) => isItemActive(item.to));

              if (group.items.length === 1) {
                const item = group.items[0];
                const ItemIcon = item.icon;
                return (
                  <NavLink
                    key={group.id}
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) => `win-nav-item ${isActive ? 'win-nav-item--active' : ''}`}
                  >
                    <ItemIcon className="win-nav-icon" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              }

              return (
                <div key={group.id} className="py-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="win-nav-group"
                    aria-expanded={isOpen}
                    style={hasActiveChild ? { color: 'var(--win-accent)' } : undefined}
                  >
                    <GroupIcon className="h-[15px] w-[15px] shrink-0" />
                    <span className="flex-1 truncate">{group.label}</span>
                    {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronLeft className="h-3 w-3 shrink-0" />}
                  </button>

                  {isOpen && (
                    <div className="mt-0.5">
                      {group.items.map((item) => {
                        const ItemIcon = item.icon;
                        return (
                          <NavLink
                            key={item.to + item.label}
                            to={item.to}
                            title={item.label}
                            onClick={onNavigate}
                            className={({ isActive }) => `win-nav-item ${isActive ? 'win-nav-item--active' : ''}`}
                          >
                            <ItemIcon className="win-nav-icon" />
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
                  )}
                </div>
              );
            })}
      </nav>

      <div className="shrink-0 border-t border-[#d9d9d9] px-2 py-1.5 dark:border-[#3d3d3d]">
        {!mobile && onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="win-btn win-btn--ghost w-full !min-h-7 !justify-start !px-2 text-[11px]"
            title={isCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
            aria-label={isCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
          >
            {isCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
            {!isCollapsed && <span>طي القائمة</span>}
          </button>
        )}
      </div>
    </aside>
  );
};
