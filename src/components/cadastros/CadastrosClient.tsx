import { useState } from 'react'
import { Users, Clock, Settings, GitCompare, ShieldCheck } from 'lucide-react'
import type { Profile, Store } from '@/types'
import FuncionariosTab from './FuncionariosTab'
import TurnosTab from './TurnosTab'
import ConfigLojaTab from './ConfigLojaTab'
import ConsistenciaTab from './ConsistenciaTab'
import UsuariosTab from './UsuariosTab'

interface Props { profile: Profile | null; initialStores: Store[] }

const ADMIN_ROLES = ['regional', 'rh', 'diretoria']

const BASE_TABS = [
  { id: 'funcionarios', label: 'Funcionários', icon: Users },
  { id: 'config',       label: 'Config. loja',  icon: Settings },
]
const ADMIN_TABS = [
  { id: 'usuarios',     label: 'Usuários',      icon: ShieldCheck },
  { id: 'consistencia', label: 'Consistência', icon: GitCompare },
]


export default function CadastrosClient({ profile, initialStores }: Props) {
  const [tab, setTab] = useState('funcionarios')
  const [selectedStore, setSelectedStore] = useState<Store>(initialStores[0])
  const isAdmin = profile && ADMIN_ROLES.includes(profile.role)
  const TABS = isAdmin ? [...BASE_TABS, ...ADMIN_TABS] : BASE_TABS

  if (!selectedStore) return (

    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
      Nenhuma loja disponível
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Topbar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3">
        <h1 className="text-sm font-semibold text-gray-800">Cadastros</h1>
        {initialStores.length > 1 && (
          <select
            value={selectedStore.id}
            onChange={e => setSelectedStore(initialStores.find(s => s.id === e.target.value)!)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-brand-50 text-brand-700 font-medium focus:outline-none focus:border-brand-400"
          >
            {initialStores.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.shopping}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-sm border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-brand-500 text-brand-700 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === 'funcionarios' && <FuncionariosTab store={selectedStore} />}
        {tab === 'turnos'       && <TurnosTab store={selectedStore} />}
        {tab === 'config'       && <ConfigLojaTab store={selectedStore} />}
        {tab === 'usuarios'     && isAdmin && <UsuariosTab />}
        {tab === 'consistencia' && isAdmin && <ConsistenciaTab />}
      </div>
    </div>
  )
}

