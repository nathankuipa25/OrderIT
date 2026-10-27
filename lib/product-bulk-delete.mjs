import {
  evaluateAdminAccess,
  evaluateProductDeletion,
  validateProductIdList,
} from "./order-business.mjs";

class BulkProductDeletionRejection extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Delete the requested products as one transaction, validating every selected
 * product before the transaction is allowed to issue its single delete.
 */
export async function bulkDeleteProducts({ session, ids, transaction }) {
  const access = evaluateAdminAccess(session);
  if (!access.allowed) {
    return { ok: false, status: access.status, error: access.error };
  }

  const selection = validateProductIdList(ids);
  if (!selection.ok) {
    return { ok: false, status: selection.status, error: selection.error };
  }

  try {
    const deleted = await transaction(async ({ findProducts, deleteProducts }) => {
      const products = await findProducts(selection.productIds);
      const productsById = new Map(products.map((product) => [product.id, product]));
      const missingIds = selection.productIds.filter((id) => !productsById.has(id));
      if (missingIds.length > 0) {
        throw new BulkProductDeletionRejection(
          400,
          "One or more selected products are invalid or no longer exist. No products were deleted. Review your selection and try again."
        );
      }

      const protectedProducts = selection.productIds
        .map((id) => productsById.get(id))
        .filter((product) => !evaluateProductDeletion(product).allowed);
      if (protectedProducts.length > 0) {
        const names = protectedProducts.map((product) => product.name).join(", ");
        throw new BulkProductDeletionRejection(
          409,
          `Cannot delete selected products used in order history: ${names}. No products were deleted. Deactivate those products instead.`
        );
      }

      const result = await deleteProducts(selection.productIds);
      if (result.count !== selection.productIds.length) {
        throw new BulkProductDeletionRejection(
          409,
          "The selected products changed before deletion finished. No products were deleted. Review your selection and try again."
        );
      }
      return result.count;
    });

    return { ok: true, status: 200, deleted };
  } catch (error) {
    if (error instanceof BulkProductDeletionRejection) {
      return { ok: false, status: error.status, error: error.message };
    }
    throw error;
  }
}
