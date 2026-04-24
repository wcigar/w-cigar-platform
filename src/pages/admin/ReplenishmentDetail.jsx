import { useParams } from 'react-router-dom'
import { StubPage } from '../../components/PageShell'
export default function ReplenishmentDetail() {
  const { id } = useParams()
  return <StubPage title={`補貨單 #${id}`} subtitle="Phase 2: A4 列印 / PDF 匯出 / 總倉實出" />
}
