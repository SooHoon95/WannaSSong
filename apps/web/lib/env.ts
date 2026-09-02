import { networkInterfaces } from 'os';
import packageJson from '../package.json';

export const VERSION = packageJson.version;

export function lanUrls(port = Number(process.env.PORT) || 3000): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(`http://${ni.address}:${port}`);
    }
  }
  return out;
}

export function speakerKey() {
  return process.env.SPEAKER_KEY || '';
}
