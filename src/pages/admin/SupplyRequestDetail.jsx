import { useParams } from 'react-router-dom'
import { StubPage } from '../../components/PageShell'
export default function SupplyRequestDetail() {
  const { id } = useParams()
  return <StubPage title={`審核 #${id}`} subtitle="Phase 2: 核准 / 調整數量後核准 / 駁回" />
}
