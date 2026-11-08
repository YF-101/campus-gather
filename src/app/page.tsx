import Campus from '@/components/campus';
export const dynamic = 'force-dynamic';
export default function Page() { return <Campus mode={process.env.CAMPUS_MODE === 'accounts' ? 'accounts' : 'demo'}/>; }
