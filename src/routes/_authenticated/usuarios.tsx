import { createFileRoute } from '@tanstack/react-router'
import UsuariosTab from '@/components/cadastros/UsuariosTab'

export const Route = createFileRoute('/_authenticated/usuarios')({
  component: UsuariosPage,
})

function UsuariosPage() {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <h1 className="text-sm font-semibold text-gray-800">Usuários</h1>
      </div>
      <div className="flex-1 overflow-auto">
        <UsuariosTab />
      </div>
    </div>
  )
}
