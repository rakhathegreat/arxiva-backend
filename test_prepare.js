import fs from 'fs';
const request = {
  requestItems: [
    { materialCategoryId: 1, brandId: 1 }
  ]
};

const item = {
  model: {
    materialCategory: { id: 1 },
    brand: { id: 1 }
  }
};

const matchingReqItem = request.requestItems.find(ri => {
  const matchCat = ri.materialCategoryId === item.model?.materialCategory?.id;
  const matchBrand = ri.brandId === null || ri.brandId === item.model?.brand?.id;
  return matchCat && matchBrand;
});

console.log(matchingReqItem ? "Matched" : "Not Matched");
