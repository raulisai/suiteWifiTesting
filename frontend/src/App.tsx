import { Outlet } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar }  from './components/layout/TopBar'

export default function App() {
  return (
    <div className="flex min-h-screen bg-dark-900 text-gray-100">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
