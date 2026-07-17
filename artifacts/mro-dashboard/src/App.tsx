import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Layout } from './components/Layout';
import DashboardPage from './pages/Dashboard';
import EngineList from './pages/EngineList';
import EngineDetail from './pages/EngineDetail';
import RecommendationList from './pages/RecommendationList';
import RecommendationDetail from './pages/RecommendationDetail';
import RuleList from './pages/RuleList';
import ProductionControlPage from './pages/ProductionControl';
import OntologyEditor from './pages/OntologyEditor';
import GraphExplorer from './pages/GraphExplorer';
import SapStatus from './pages/SapStatus';
import ShopVisits from './pages/ShopVisits';
import BacktestRuns from './pages/BacktestRuns';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

function NotFound() {
  return (
    <div className="page-container text-center py-20">
      <h1 className="text-2xl font-bold mb-4">404 - Page Not Found</h1>
      <p>The requested route does not exist.</p>
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/engines" component={EngineList} />
        <Route path="/engines/:esn" component={EngineDetail} />
        <Route path="/recommendations" component={RecommendationList} />
        <Route path="/recommendations/:id" component={RecommendationDetail} />
        <Route path="/production" component={ProductionControlPage} />
        <Route path="/rules" component={RuleList} />
        <Route path="/ontology" component={OntologyEditor} />
        <Route path="/graph" component={GraphExplorer} />
        <Route path="/sap" component={SapStatus} />
        <Route path="/exchanges" component={ShopVisits} />
        <Route path="/backtest" component={BacktestRuns} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
