import { useParams } from 'react-router-dom'
import { StubPage } from '../../components/PageShell'
export default function AmbassadorSupplyDetail() {
  const { id } = useParams()
  return <StubPage title={`耗材申請 #${id}`} />
}
