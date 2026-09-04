import { SetMetadata } from "@nestjs/common";
import { Role } from "@le-garage/database";

export const ROLES_KEY = "roles";

/**
 * Declares which garage-staff roles may call this route (docs/AUTH.md §3-4).
 * Unlisted routes default to "any authenticated staff member of the
 * resolved tenant" — see RolesGuard.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
