import { createBrowserRouter } from 'react-router-dom'
import { KineticTerminal } from './pages/KineticTerminal'

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <KineticTerminal />,
    },
    // Alias kept for backwards compatibility
    {
      path: '/kinetic',
      element: <KineticTerminal />,
    },
  ],
  {
    future: {
      v7_startTransition: true,
    },
  },
)
