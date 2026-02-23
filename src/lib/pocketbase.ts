import PocketBase from 'pocketbase';
import type { TypedPocketBase } from './pocketbase-types';
import { PUBLIC_POCKETBASE_URL } from '$env/static/public';

export const pb = new PocketBase(
    PUBLIC_POCKETBASE_URL ?? 'http://127.0.0.1:8090'
) as TypedPocketBase;
