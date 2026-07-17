const GLOBAL_ROLES = new Set(['owner', 'global_super_admin']);

const isGlobalRole = (role) => GLOBAL_ROLES.has(String(role || ''));

const getUserBranchId = (user) => {
  const branchId = Number(user?.branch_id);
  return Number.isInteger(branchId) && branchId > 0 ? branchId : 1;
};

const getScopedBranchId = (req) => {
  if (isGlobalRole(req.user?.role) && req.query?.branch_id) {
    const requestedBranchId = Number(req.query.branch_id);
    if (Number.isInteger(requestedBranchId) && requestedBranchId > 0) {
      return requestedBranchId;
    }
  }

  return getUserBranchId(req.user);
};

module.exports = {
  isGlobalRole,
  getUserBranchId,
  getScopedBranchId
};
