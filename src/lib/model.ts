export const actors = [
    { id: 'student', name: '林同学', role: 'student', label: '学生' },
    { id: 'friend', name: '周同学', role: 'student', label: '学生' },
    { id: 'organizer', name: '许老师', role: 'organizer', label: '组织者' },
    { id: 'other-organizer', name: '陈老师', role: 'organizer', label: '另一位组织者' },
] as const;
export type Activity = {
    cancelled_at?: string | null;
    cancellation_reason?: string | null;
    id: string;
    owner_id: string;
    title: string;
    description: string;
    location: string;
    category: string;
    starts_at: string;
    deadline: string;
    capacity: number;
    enrolled: number;
    registered: boolean;
    checked_in_at: string | null;
    organizer: string;
};
export type Attendee = {
    user_id: string;
    name: string;
    registered_at: string;
    checked_in_at: string | null;
};
export type ActivityInput = {
    title: string;
    description: string;
    location: string;
    category: string;
    starts_at: string;
    deadline: string;
    capacity: number;
};
export const categories = ['技术', '艺术', '运动', '公益', '生活'] as const;
export function formatDate(value: string, options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...options }).format(new Date(value)); }
