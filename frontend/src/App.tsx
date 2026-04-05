import { Outlet } from 'react-router-dom'
import { Sidebar }                from './components/layout/Sidebar'
import { TopBar }                 from './components/layout/TopBar'
import { BackendOfflineBanner }   from './components/layout/BackendOfflineBanner'
import { ToastContainer }         from './components/ToastContainer'
import { useBackendStatus }       from './hooks/useBackendStatus'

export default function App() {
  const backendStatus = useBackendStatus()

  return (
    <div className="flex min-h-screen bg-dark-900 text-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <BackendOfflineBanner status={backendStatus} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      {/* Global toast notifications — renders above everything */}
      <ToastContainer />
    </div>
  )
}
