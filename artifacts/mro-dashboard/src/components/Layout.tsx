import React from 'react';
import { Link, useLocation } from 'wouter';
import {
  Header,
  HeaderContainer,
  HeaderName,
  HeaderNavigation,
  HeaderMenuButton,
  HeaderMenuItem,
  SideNav,
  SideNavItems,
  SideNavLink,
  SkipToContent,
  HeaderGlobalBar,
  HeaderGlobalAction,
} from '@carbon/react';
import { 
  Dashboard, 
  SettingsAdjust, 
  FlowData,
  DataStructured,
  DocumentTasks,
  DataVis_1,
  CloudApp,
  Time,
  Types
} from '@carbon/icons-react';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  return (
    <HeaderContainer
      render={({ isSideNavExpanded, onClickSideNavExpand }) => (
        <>
          <Header aria-label="AeroEngine MRO Decision Support">
            <SkipToContent />
            <HeaderMenuButton
              aria-label="Open menu"
              onClick={onClickSideNavExpand}
              isActive={isSideNavExpanded}
            />
            <Link href="/" asChild>
              <HeaderName href="/" prefix="AeroEngine">
                MRO Decision Support
              </HeaderName>
            </Link>
            <HeaderNavigation aria-label="Main navigation">
              <Link href="/engines" asChild><HeaderMenuItem href="/engines">Fleet</HeaderMenuItem></Link>
              <Link href="/recommendations" asChild><HeaderMenuItem href="/recommendations">Work Queue</HeaderMenuItem></Link>
              <Link href="/rules" asChild><HeaderMenuItem href="/rules">Rules Engine</HeaderMenuItem></Link>
            </HeaderNavigation>
            <HeaderGlobalBar>
              <HeaderGlobalAction aria-label="System Settings" tooltipAlignment="end">
                <SettingsAdjust size={20} />
              </HeaderGlobalAction>
            </HeaderGlobalBar>

            <SideNav aria-label="Side navigation" expanded={isSideNavExpanded} isPersistent={false}>
              <SideNavItems>
                <Link href="/" asChild>
                  <SideNavLink renderIcon={Dashboard} href="/" isActive={location === '/'}>
                    Dashboard
                  </SideNavLink>
                </Link>
                <Link href="/engines" asChild>
                  <SideNavLink renderIcon={FlowData} href="/engines" isActive={location.startsWith('/engines')}>
                    Engines
                  </SideNavLink>
                </Link>
                <Link href="/recommendations" asChild>
                  <SideNavLink renderIcon={DocumentTasks} href="/recommendations" isActive={location.startsWith('/recommendations')}>
                    Recommendations
                  </SideNavLink>
                </Link>
                <Link href="/rules" asChild>
                  <SideNavLink renderIcon={SettingsAdjust} href="/rules" isActive={location.startsWith('/rules')}>
                    Rules
                  </SideNavLink>
                </Link>
                <Link href="/ontology" asChild>
                  <SideNavLink renderIcon={DataStructured} href="/ontology" isActive={location.startsWith('/ontology')}>
                    Ontology
                  </SideNavLink>
                </Link>
                <Link href="/graph" asChild>
                  <SideNavLink renderIcon={DataVis_1} href="/graph" isActive={location.startsWith('/graph')}>
                    Knowledge Graph
                  </SideNavLink>
                </Link>
                <Link href="/sap" asChild>
                  <SideNavLink renderIcon={CloudApp} href="/sap" isActive={location.startsWith('/sap')}>
                    SAP Adapter
                  </SideNavLink>
                </Link>
                <Link href="/exchanges" asChild>
                  <SideNavLink renderIcon={Types} href="/exchanges" isActive={location.startsWith('/exchanges')}>
                    Shop Visits
                  </SideNavLink>
                </Link>
                <Link href="/backtest" asChild>
                  <SideNavLink renderIcon={Time} href="/backtest" isActive={location.startsWith('/backtest')}>
                    Backtesting
                  </SideNavLink>
                </Link>
              </SideNavItems>
            </SideNav>
          </Header>
          <div className="app-content">
            {children}
          </div>
        </>
      )}
    />
  );
}
