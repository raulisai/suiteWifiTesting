import { createBrowserRouter } from 'react-router-dom'
import App from './App'
import { Dashboard }       from './pages/Dashboard'
import { Networks }        from './pages/Networks'
import { Terminal }        from './pages/Terminal'
import { Campaigns }       from './pages/Campaigns'
import { Credentials }     from './pages/Credentials'
import { Reports }         from './pages/Reports'
import { KineticTerminal } from './pages/KineticTerminal'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true,         element: <Dashboard /> },
      { path: 'networks',    element: <Networks /> },
      { path: 'terminal',    element: <Terminal /> },
      { path: 'campaigns',   element: <Campaigns /> },
      { path: 'credentials', element: <Credentials /> },
      { path: 'reports',     element: <Reports /> },
    ],
  },
  // Full-screen standalone — no sidebar/topbar wrapper
  {
    path: '/kinetic',
    element: <KineticTerminal />,
  },
])
