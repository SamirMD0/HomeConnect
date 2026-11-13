import { logoutSession, refreshSession, type AuthenticatedUser } from '../api/auth-api';
import {
  clearAllAuth,
  clearRefreshToken,
  loadAuthToken,
  loadRefreshToken,
  saveAuthToken,
  saveAuthUser,
  saveRefreshToken,
} from '../storage/secure-storage';
import type { ConnectionSettings } from '../types/scanner.types';

/** Serializes credential writes so a late refresh/logout cannot overwrite a new login. */
export class TokenSession {
  accessToken: string | null = null;
  private refreshToken: string | null = null;
  private revision = 0;
  private writes: Promise<unknown> = Promise.resolve();

  constructor(private readonly onAccessToken: (token: string | null) => void) {}

  private write<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.writes.then(operation);
    this.writes = pending.catch(() => undefined);
    return pending;
  }

  async restore() {
    const revision = this.revision;
    const [access, refresh] = await Promise.all([loadAuthToken(), loadRefreshToken()]);
    if (revision !== this.revision) return;
    this.accessToken = access;
    this.refreshToken = refresh;
    this.onAccessToken(access);
  }

  async login(accessToken: string, user: AuthenticatedUser, refreshToken: string | null) {
    const revision = ++this.revision;
    await this.write(async () => {
      await Promise.all([
        saveAuthToken(accessToken),
        saveAuthUser(user),
        refreshToken ? saveRefreshToken(refreshToken) : clearRefreshToken(),
      ]);
      if (revision !== this.revision) return;
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.onAccessToken(accessToken);
    });
  }

  async refresh(connection: ConnectionSettings): Promise<string | null> {
    const originalToken = this.accessToken,
      revision = this.revision;
    if (!originalToken) return null;
    const result = await refreshSession(connection, originalToken, this.refreshToken);
    return this.write(async () => {
      if (revision !== this.revision || this.accessToken !== originalToken) return null;
      if (result.refreshToken) await saveRefreshToken(result.refreshToken);
      await saveAuthToken(result.accessToken);
      if (revision !== this.revision) return null;
      this.refreshToken = result.refreshToken ?? this.refreshToken;
      this.accessToken = result.accessToken;
      this.onAccessToken(result.accessToken);
      return result.accessToken;
    });
  }

  signOut(connection: ConnectionSettings | null): Promise<void> {
    const logout =
      connection && this.accessToken
        ? logoutSession(connection, this.accessToken, this.refreshToken).catch(() => undefined)
        : Promise.resolve();
    this.revision++;
    this.accessToken = null;
    this.refreshToken = null;
    this.onAccessToken(null);
    return this.write(async () => {
      await logout;
      await clearAllAuth();
    });
  }
}
