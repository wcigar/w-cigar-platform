import { useParams } from 'react-router-dom'
import { StubPage } from '../../components/PageShell'
export default function ShipmentDetail() {
  const { id } = useParams()
  return <StubPage title={`出貨單 #${id}`} subtitle="Phase 2: 撿貨、出貨量、列印" />
}
