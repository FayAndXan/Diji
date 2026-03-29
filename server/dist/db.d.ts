import { Pool } from 'pg';
declare const pool: Pool;
export interface User {
    id: string;
    email: string;
    token: string;
    link_token: string;
    companion_name: string;
    created_at: Date;
    updated_at: Date;
    channel_links?: ChannelLink[];
    health_profile?: HealthProfile;
}
export interface ChannelLink {
    id: string;
    channel: string;
    peer_id: string;
    linked_at: Date;
}
export interface HealthProfile {
    language: string;
    timezone: string;
    companion_gender: string;
    companion_name: string;
    has_band: boolean;
    sleeps_with_band: boolean;
    dob?: string;
    sex?: string;
    height_cm?: number;
    weight_kg?: number;
    activity_level?: string;
    goal?: string;
    dietary_restrictions?: string[];
}
export declare function createUser(email: string, companionName?: string): Promise<User>;
export declare function getUserByEmail(email: string): Promise<User | null>;
export declare function getUserByToken(token: string): Promise<User | null>;
export declare function getUserById(id: string): Promise<User | null>;
export declare function getUserByIdentifier(identifier: string): Promise<User | null>;
export declare function getAllUsers(): Promise<User[]>;
export declare function linkChannel(userId: string, channel: string, peerId: string): Promise<ChannelLink>;
export declare function getUserByChannelPeer(channel: string, peerId: string): Promise<User | null>;
export declare function updateHealthProfile(userId: string, updates: Partial<HealthProfile>): Promise<void>;
export declare function saveHealthSync(userId: string, data: any): Promise<void>;
export declare function getLatestHealthSync(userId: string): Promise<any | null>;
export declare function getHealthHistory(userId: string, days?: number): Promise<any[]>;
export declare function saveMeal(userId: string, items: any, totals: any, vitamins?: any, minerals?: any, source?: string): Promise<string>;
export declare function getMealsForDate(userId: string, date: string): Promise<any[]>;
export declare function hasTriggerFired(userId: string, triggerType: string, date?: string): Promise<boolean>;
export declare function logTrigger(userId: string, triggerType: string, message?: string): Promise<void>;
export declare function saveDevicePairing(deviceId: string, publicKey: string, privateKey: string): Promise<void>;
export declare function getDevicePairing(deviceId: string): Promise<any | null>;
export declare function approveDevicePairing(deviceId: string): Promise<void>;
export declare function createScheduledJob(params: {
    userId?: string;
    jobType: string;
    cronExpression?: string;
    nextRunAt: Date;
    payload?: any;
    channel?: string;
    targetId?: string;
    deleteAfterRun?: boolean;
}): Promise<string>;
export declare function getDueJobs(): Promise<any[]>;
export declare function markJobRun(jobId: string, nextRunAt?: Date): Promise<void>;
export declare function saveMemory(userId: string, content: string, topic?: string, source?: string): Promise<void>;
export declare function getMemories(userId: string, limit?: number): Promise<any[]>;
export declare function upsertSession(userId: string, sessionKey: string, model: string): Promise<void>;
export declare function saveSessionMessage(sessionKey: string, role: string, content: any, tokenCount?: number): Promise<void>;
export declare function saveSupplementStack(userId: string, supplement: any): Promise<void>;
export declare function saveBloodWork(userId: string, testDate: string, markers: any, labName?: string): Promise<void>;
export declare function getLatestBloodWork(userId: string): Promise<any | null>;
export declare function saveWorkout(userId: string, workout: any): Promise<void>;
export declare function saveSymptom(userId: string, symptom: string, severity: number): Promise<void>;
export declare function savePlan(userId: string, planData: any): Promise<void>;
export declare function getPlan(userId: string): Promise<any | null>;
export declare function migrateFromJson(usersJson: Record<string, any>): Promise<{
    imported: number;
    errors: string[];
}>;
export declare function checkConnection(): Promise<boolean>;
export declare function closePool(): Promise<void>;
export { pool };
//# sourceMappingURL=db.d.ts.map