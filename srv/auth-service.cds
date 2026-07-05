using { nadec.e2e as my } from '../db/schema';

/**
 * AuthService — sign-in + the Admin "Users" administration screen.
 *
 * Same shape as the NADEC Visitor-Gate AuthService:
 *   - `login`        : local-dev sign-in (bcrypt) → app JWT.
 *   - `xsuaaLogin`   : production — exchange the XSUAA token for an app JWT,
 *                      auto-provisioning the user from SuccessFactors if new.
 *   - `getCurrentUser` / `getAuthMode` : session helpers for the UI.
 *   - `Users`        : full CRUD, **Admin only**. `password` is write-only —
 *                      hashed on write, never returned on read (see auth-service.js).
 */
service AuthService @(path: '/auth') {

  // Admin-only user administration. Everything is enforced server-side; the
  // Users screen just calls this. (Admin ⊇ Manager, so an Admin also passes
  // all Manager-guarded rules on the GovernanceService.)
  @(restrict: [{ grant: '*', to: 'Admin' }])
  entity Users as projection on my.Users;

  // ---- Local dev sign-in: verify bcrypt password → issue an app JWT ----
  action login(email: String, password: String) returns {
    token : String;
    user  : {
      email      : String;
      name       : String;
      employeeId : String;
      role       : String;
    };
  };

  // ---- Production sign-in: XSUAA token → app JWT (SF auto-provision) ----
  action xsuaaLogin() returns {
    token : String;
    user  : {
      email      : String;
      name       : String;
      employeeId : String;
      role       : String;
    };
  };

  // ---- Session helpers ----
  function getCurrentUser() returns {
    email      : String;
    name       : String;
    employeeId : String;
    role       : String;
    roles      : array of String;
  };

  function getAuthMode() returns { mode : String; };
}
