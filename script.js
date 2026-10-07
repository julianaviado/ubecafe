/**
 * Ube Café Nutrition Planner
 * Deterministic, rule-based meal planning & nutrition engine (no AI).
 *
 * Modules
 *  1. Reference data        – nutrients, food dictionary, restrictions, units, seeds
 *  2. Utilities & Storage   – formatting, escaping, per-account localStorage
 *  3. NutritionEngine       – Mifflin-St Jeor energy, macro/micro targets, body composition
 *  4. RecipeManager         – raw text + ingredient parsing, nutrition analysis
 *  5. SubstitutionEngine    – allergen & diet screening with rule-based safe swaps
 *  6. RecommendationEngine  – if/else "which food & why" rules
 *  7. ScheduleOptimizer     – meal timeline + supplement timing rules
 *  8. GroceryAggregator     – weekly ingredient roll-up grouped by aisle
 *  9. AuthManager           – local accounts with PBKDF2-hashed passwords
 * 10. UI controllers        – auth view, onboarding wizard, tabs, panels, drawer
 */
'use strict';

/* =========================================================
 * 1. Reference data
 * ======================================================= */

const NUTRIENTS = [
  { key: 'calories', label: 'Calories', unit: 'kcal', group: 'macro' },
  { key: 'protein', label: 'Protein', unit: 'g', group: 'macro' },
  { key: 'carbs', label: 'Carbohydrates', unit: 'g', group: 'macro' },
  { key: 'fat', label: 'Fat', unit: 'g', group: 'macro' },
  { key: 'sugar', label: 'Sugar', unit: 'g', group: 'macro', isLimit: true },
  { key: 'fiber', label: 'Fiber', unit: 'g', group: 'micro' },
  { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg', group: 'micro' },
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', group: 'micro' },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg', group: 'micro' },
  { key: 'vitaminB12', label: 'Vitamin B12', unit: 'mcg', group: 'micro' },
  { key: 'calcium', label: 'Calcium', unit: 'mg', group: 'micro' },
  { key: 'iron', label: 'Iron', unit: 'mg', group: 'micro' },
  { key: 'potassium', label: 'Potassium', unit: 'mg', group: 'micro' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', group: 'micro' },
  { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'micro' },
  { key: 'omega3', label: 'Omega-3', unit: 'g', group: 'micro' },
];
const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);
const NUTRIENT_BY_KEY = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n]));

const AISLES = ['Produce', 'Meat & Seafood', 'Dairy', 'Pantry & Grains', 'Supplements & Spices'];
const [PRODUCE, MEAT, DAIRY, PANTRY, SPICES] = AISLES;

/**
 * Food dictionary. Values are per 100 g, in NUTRIENT_KEYS order:
 * kcal, protein, carbs, fat, sugar, fiber, vitA(mcg RAE), vitC(mg), vitD(mcg),
 * B12(mcg), calcium(mg), iron(mg), potassium(mg), magnesium(mg), zinc(mg), omega-3(g).
 * gPerUnit = grams for one "piece/clove/slice"; gPerCup = grams in one US cup.
 * count = label used on the grocery list for countable produce.
 */
const FOOD_ROWS = [
  ['spinach', 'Spinach', PRODUCE, ['spinach', 'baby spinach'], 30, 30, [23, 2.9, 3.6, 0.4, 0.4, 2.2, 469, 28, 0, 0, 99, 2.7, 558, 79, 0.5, 0.14]],
  ['kale', 'Kale', PRODUCE, ['kale'], 21, 21, [35, 2.9, 4.4, 1.5, 0.8, 4.1, 241, 93, 0, 0, 254, 1.6, 348, 33, 0.4, 0.18]],
  ['broccoli', 'Broccoli', PRODUCE, ['broccoli', 'broccoli florets'], 150, 91, [34, 2.8, 6.6, 0.4, 1.7, 2.6, 31, 89, 0, 0, 47, 0.7, 316, 21, 0.4, 0.02]],
  ['bell-pepper', 'Red bell pepper', PRODUCE, ['bell pepper', 'red pepper', 'green pepper', 'yellow pepper', 'capsicum'], 120, 150, [31, 1, 6, 0.3, 4.2, 2.1, 157, 128, 0, 0, 7, 0.4, 211, 12, 0.3, 0.03], 'pcs'],
  ['sweet-potato', 'Sweet potato', PRODUCE, ['sweet potato', 'yam'], 130, 133, [86, 1.6, 20, 0.1, 4.2, 3, 709, 2.4, 0, 0, 30, 0.6, 337, 25, 0.3, 0], 'pcs'],
  ['carrot', 'Carrot', PRODUCE, ['carrot'], 61, 128, [41, 0.9, 9.6, 0.2, 4.7, 2.8, 835, 5.9, 0, 0, 33, 0.3, 320, 12, 0.2, 0], 'pcs'],
  ['tomato', 'Tomato', PRODUCE, ['tomato', 'diced tomato', 'cherry tomato'], 123, 180, [18, 0.9, 3.9, 0.2, 2.6, 1.2, 42, 14, 0, 0, 10, 0.3, 237, 11, 0.2, 0], 'pcs', 400],
  ['onion', 'Onion', PRODUCE, ['onion', 'red onion', 'shallot'], 110, 160, [40, 1.1, 9.3, 0.1, 4.2, 1.7, 0, 7.4, 0, 0, 23, 0.2, 146, 10, 0.2, 0], 'pcs'],
  ['garlic', 'Garlic', PRODUCE, ['garlic', 'garlic clove'], 3, 136, [149, 6.4, 33, 0.5, 1, 2.1, 0, 31, 0, 0, 181, 1.7, 401, 25, 1.2, 0], 'cloves'],
  ['ginger', 'Ginger', PRODUCE, ['ginger'], 10, 96, [80, 1.8, 18, 0.8, 1.7, 2, 0, 5, 0, 0, 16, 0.6, 415, 43, 0.3, 0]],
  ['cucumber', 'Cucumber', PRODUCE, ['cucumber'], 300, 120, [15, 0.7, 3.6, 0.1, 1.7, 0.5, 5, 2.8, 0, 0, 16, 0.3, 147, 13, 0.2, 0], 'pcs'],
  ['mushroom', 'Mushrooms', PRODUCE, ['mushroom'], 18, 70, [22, 3.1, 3.3, 0.3, 2, 1, 0, 2.1, 0.2, 0.04, 3, 0.5, 318, 9, 0.5, 0]],
  ['avocado', 'Avocado', PRODUCE, ['avocado'], 150, 150, [160, 2, 8.5, 14.7, 0.7, 6.7, 7, 10, 0, 0, 12, 0.6, 485, 29, 0.6, 0.11], 'pcs'],
  ['banana', 'Banana', PRODUCE, ['banana'], 118, 150, [89, 1.1, 22.8, 0.3, 12.2, 2.6, 3, 8.7, 0, 0, 5, 0.3, 358, 27, 0.2, 0.03], 'pcs'],
  ['apple', 'Apple', PRODUCE, ['apple'], 182, 125, [52, 0.3, 13.8, 0.2, 10.4, 2.4, 3, 4.6, 0, 0, 6, 0.1, 107, 5, 0, 0], 'pcs'],
  ['orange', 'Orange', PRODUCE, ['orange'], 131, 180, [47, 0.9, 11.8, 0.1, 9.4, 2.4, 11, 53, 0, 0, 40, 0.1, 181, 10, 0.1, 0.01], 'pcs'],
  ['kiwi', 'Kiwi', PRODUCE, ['kiwi', 'kiwifruit'], 69, 180, [61, 1.1, 14.7, 0.5, 9, 3, 4, 93, 0, 0, 34, 0.3, 312, 17, 0.1, 0.04], 'pcs'],
  ['lemon', 'Lemon', PRODUCE, ['lemon', 'lemon juice', 'lime', 'lime juice'], 58, 244, [29, 1.1, 9.3, 0.3, 2.5, 2.8, 1, 53, 0, 0, 26, 0.6, 138, 8, 0.1, 0], 'pcs'],
  ['blueberries', 'Blueberries', PRODUCE, ['blueberry', 'blueberries'], 148, 148, [57, 0.7, 14.5, 0.3, 10, 2.4, 3, 9.7, 0, 0, 6, 0.3, 77, 6, 0.2, 0.06]],
  ['strawberries', 'Strawberries', PRODUCE, ['strawberry', 'strawberries'], 152, 152, [32, 0.7, 7.7, 0.3, 4.9, 2, 1, 59, 0, 0, 16, 0.4, 153, 13, 0.1, 0.07]],
  ['tofu', 'Firm tofu', PRODUCE, ['tofu', 'firm tofu'], 120, 248, [144, 17.3, 2.8, 8.7, 0.6, 2.3, 0, 0.2, 0, 0, 683, 2.7, 237, 58, 1.6, 0.6]],
  ['chicken', 'Chicken breast', MEAT, ['chicken', 'chicken breast'], 200, 140, [120, 22.5, 0, 2.6, 0, 0, 9, 0, 0.1, 0.2, 5, 0.4, 334, 28, 0.7, 0.02]],
  ['beef', 'Lean ground beef', MEAT, ['beef', 'ground beef', 'lean beef', 'steak'], 113, 225, [176, 20, 0, 10, 0, 0, 0, 0, 0.1, 2.2, 12, 2.2, 321, 20, 4.8, 0.04]],
  ['salmon', 'Salmon', MEAT, ['salmon', 'salmon fillet'], 170, 140, [208, 20, 0, 13, 0, 0, 12, 0, 11, 3.2, 9, 0.3, 363, 27, 0.4, 2.3], 'fillets'],
  ['tuna', 'Canned tuna', MEAT, ['tuna'], 142, 154, [116, 25.5, 0, 0.8, 0, 0, 6, 0, 1.2, 2.5, 11, 1.5, 237, 27, 0.8, 0.27], 'cans', 142],
  ['sardines', 'Sardines', MEAT, ['sardine'], 92, 150, [208, 24.6, 0, 11.5, 0, 0, 32, 0, 4.8, 8.9, 382, 2.9, 397, 39, 1.3, 1.48], 'cans', 92],
  ['shrimp', 'Shrimp', MEAT, ['shrimp', 'prawn'], 15, 145, [85, 20, 0, 0.5, 0, 0, 0, 0, 0, 1.1, 64, 0.2, 264, 35, 1.3, 0.3]],
  ['eggs', 'Eggs', DAIRY, ['egg'], 50, 243, [143, 12.6, 0.7, 9.5, 0.4, 0, 160, 0, 2, 0.9, 56, 1.8, 138, 12, 1.3, 0.07], 'eggs'],
  ['greek-yogurt', 'Greek yogurt', DAIRY, ['greek yogurt', 'yogurt', 'yoghurt'], 170, 245, [59, 10, 3.6, 0.4, 3.2, 0, 1, 0, 0, 0.75, 110, 0.1, 141, 11, 0.5, 0]],
  ['cottage-cheese', 'Cottage cheese', DAIRY, ['cottage cheese'], 113, 226, [81, 10.5, 4.8, 2.3, 4, 0, 28, 0, 0, 0.5, 111, 0.2, 125, 9, 0.5, 0.01]],
  ['milk', 'Milk', DAIRY, ['milk', 'fortified milk', 'whole milk', 'skim milk'], 244, 244, [50, 3.3, 4.8, 2, 5, 0, 55, 0, 1.2, 0.5, 120, 0, 150, 11, 0.4, 0]],
  ['cheddar', 'Cheddar cheese', DAIRY, ['cheese', 'cheddar', 'cheddar cheese', 'feta', 'feta cheese'], 28, 113, [403, 25, 1.3, 33, 0.5, 0, 265, 0, 0.6, 0.8, 721, 0.7, 98, 28, 3.1, 0.1]],
  ['oat-milk', 'Fortified oat milk', DAIRY, ['oat milk', 'oatmilk'], 240, 240, [48, 1, 6.7, 2, 2.9, 0.8, 0, 0, 1.1, 0.38, 120, 0.3, 160, 5, 0.1, 0.1]],
  ['almond-milk', 'Almond milk', DAIRY, ['almond milk'], 240, 240, [15, 0.6, 0.6, 1.1, 0, 0.2, 63, 0, 1, 0, 184, 0.3, 67, 7, 0.1, 0]],
  ['soy-milk', 'Fortified soy milk', DAIRY, ['soy milk', 'soymilk'], 243, 243, [43, 3.6, 1.7, 2.4, 1, 0.5, 63, 0, 1.1, 1.1, 123, 0.4, 148, 16, 0.3, 0.2]],
  ['coconut-yogurt', 'Coconut yogurt', DAIRY, ['coconut yogurt', 'dairy free yogurt'], 150, 245, [120, 0.5, 6, 10.5, 2, 0.5, 0, 0, 0, 0, 120, 0.2, 40, 5, 0.1, 0]],
  ['butter', 'Butter', DAIRY, ['butter'], 14, 227, [717, 0.9, 0.1, 81, 0.1, 0, 684, 0, 0, 0.2, 24, 0, 24, 2, 0.1, 0.3]],
  ['oats', 'Rolled oats', PANTRY, ['oats', 'rolled oats', 'oatmeal'], 40, 81, [379, 13, 68, 6.5, 1, 10, 0, 0, 0, 0, 52, 4.3, 362, 138, 3.6, 0.1]],
  ['brown-rice', 'Brown rice', PANTRY, ['rice', 'brown rice'], 45, 185, [367, 7.5, 76, 3.2, 0.9, 3.6, 0, 0, 0, 0, 9, 1.5, 250, 143, 2, 0.03]],
  ['quinoa', 'Quinoa', PANTRY, ['quinoa'], 45, 170, [368, 14, 64, 6, 0, 7, 1, 0, 0, 0, 47, 4.6, 563, 197, 3.1, 0.26]],
  ['bread', 'Whole wheat bread', PANTRY, ['bread', 'toast', 'whole wheat bread', 'tortilla', 'wrap'], 32, 45, [252, 12.5, 43, 3.5, 4.4, 6, 0, 0, 0, 0, 161, 2.5, 248, 76, 1.8, 0.1]],
  ['pasta', 'Whole wheat pasta', PANTRY, ['pasta', 'spaghetti', 'penne', 'noodle'], 56, 100, [348, 14.6, 72, 1.4, 2.7, 9, 0, 0, 0, 0, 40, 3.6, 215, 143, 2.4, 0.03]],
  ['lentils', 'Lentils', PANTRY, ['lentil', 'lentils', 'red lentils'], 50, 192, [352, 24.6, 63, 1.1, 2, 10.7, 2, 4.5, 0, 0, 35, 6.5, 677, 47, 3.3, 0.1]],
  ['black-beans', 'Black beans', PANTRY, ['beans', 'black beans', 'kidney beans'], 86, 172, [91, 6, 16.6, 0.3, 0.3, 6.9, 0, 0, 0, 0, 35, 1.9, 308, 48, 0.7, 0.1], 'cans', 240],
  ['chickpeas', 'Chickpeas', PANTRY, ['chickpea', 'chickpeas', 'garbanzo', 'garbanzo beans'], 82, 164, [139, 7, 22.5, 2.6, 0, 6.4, 1, 0.5, 0, 0, 43, 1.5, 172, 29, 1, 0.04], 'cans', 240],
  ['broth', 'Vegetable broth', PANTRY, ['broth', 'stock', 'vegetable broth', 'chicken broth', 'chicken stock', 'vegetable stock'], 240, 240, [6, 0.3, 1, 0.1, 0.5, 0, 10, 0, 0, 0, 4, 0.1, 30, 2, 0, 0]],
  ['olive-oil', 'Olive oil', PANTRY, ['oil', 'olive oil', 'extra virgin olive oil', 'avocado oil'], 14, 216, [884, 0, 0, 100, 0, 0, 0, 0, 0, 0, 1, 0.6, 1, 0, 0, 0.76]],
  ['almonds', 'Almonds', PANTRY, ['almond', 'almonds'], 28, 143, [579, 21, 21.6, 49.9, 4.4, 12.5, 0, 0, 0, 0, 269, 3.7, 733, 270, 3.1, 0]],
  ['walnuts', 'Walnuts', PANTRY, ['walnut', 'walnuts'], 28, 117, [654, 15.2, 13.7, 65.2, 2.6, 6.7, 1, 1.3, 0, 0, 98, 2.9, 441, 158, 3.1, 9.1]],
  ['chia', 'Chia seeds', PANTRY, ['chia', 'chia seeds'], 12, 192, [486, 16.5, 42, 30.7, 0, 34.4, 0, 1.6, 0, 0, 631, 7.7, 407, 335, 4.6, 17.8]],
  ['pumpkin-seeds', 'Pumpkin seeds', PANTRY, ['pumpkin seeds', 'pepitas'], 28, 129, [559, 30, 10.7, 49, 1.4, 6, 1, 1.9, 0, 0, 46, 8.8, 809, 592, 7.8, 0.12]],
  ['peanut-butter', 'Peanut butter', PANTRY, ['peanut butter'], 32, 256, [588, 25, 20, 50, 9.2, 6, 0, 0, 0, 0, 43, 1.9, 649, 154, 2.5, 0.03]],
  ['honey', 'Honey', PANTRY, ['honey'], 21, 339, [304, 0.3, 82, 0, 82, 0.2, 0, 0.5, 0, 0, 6, 0.4, 52, 2, 0.2, 0]],
  ['almond-butter', 'Almond butter', PANTRY, ['almond butter', 'cashew butter', 'nut butter'], 32, 256, [614, 21, 19, 56, 4.4, 10, 0, 0, 0, 0, 264, 3.5, 748, 279, 3.3, 0.4]],
  // Allergy-safe substitutes (see ALLERGY_SUBSTITUTES)
  ['sunflower-butter', 'Sunflower seed butter', PANTRY, ['sunflower seed butter', 'sunflower butter', 'sunbutter'], 32, 256, [617, 17.3, 23.3, 55.2, 3, 5.7, 0, 0.2, 0, 0, 64, 4.1, 576, 311, 5.3, 0.07]],
  ['sunflower-seeds', 'Sunflower seeds', PANTRY, ['sunflower seed', 'sunflower seeds'], 28, 140, [584, 20.8, 20, 51.5, 2.6, 8.6, 3, 1.4, 0, 0, 78, 5.3, 645, 325, 5, 0.07]],
  ['hemp-seeds', 'Hemp seeds', PANTRY, ['hemp seed', 'hemp seeds', 'hemp hearts'], 30, 160, [553, 31.6, 8.7, 48.8, 1.5, 4, 1, 0.5, 0, 0, 70, 8, 1200, 700, 9.9, 8.7]],
  ['nutritional-yeast', 'Nutritional yeast', PANTRY, ['nutritional yeast'], 5, 80, [400, 50, 33, 5, 0, 20, 0, 0, 0, 50, 40, 4, 2000, 160, 20, 0]],
  ['gf-oats', 'Certified gluten-free oats', PANTRY, ['gluten free oats', 'certified gluten free oats'], 40, 81, [379, 13, 68, 6.5, 1, 10, 0, 0, 0, 0, 52, 4.3, 362, 138, 3.6, 0.1]],
  ['gf-pasta', 'Gluten-free brown rice pasta', PANTRY, ['gluten free pasta', 'rice pasta', 'brown rice pasta'], 56, 100, [360, 7.5, 76, 2.7, 0.5, 3.4, 0, 0, 0, 0, 10, 1, 200, 90, 1.5, 0]],
  ['gf-bread', 'Gluten-free bread', PANTRY, ['gluten free bread'], 30, 45, [250, 4, 45, 6, 4, 4, 0, 0, 0, 0, 80, 2, 150, 30, 0.6, 0.1]],
  ['coconut-aminos', 'Coconut aminos', PANTRY, ['coconut aminos'], 15, 240, [33, 0, 7, 0, 7, 0, 0, 0, 0, 0, 0, 0, 180, 0, 0, 0]],
  ['soy-sauce', 'Soy sauce', PANTRY, ['soy sauce', 'shoyu'], 16, 255, [53, 8, 4.9, 0.6, 0.4, 0.8, 0, 0, 0, 0, 33, 1.5, 435, 74, 0.4, 0]],
  ['salt', 'Sea salt', SPICES, ['salt', 'sea salt'], 1, 288, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 24, 0.3, 8, 1, 0.1, 0]],
  ['black-pepper', 'Black pepper', SPICES, ['pepper', 'black pepper'], 1, 110, [251, 10, 64, 3.3, 0.6, 25, 27, 0, 0, 0, 443, 9.7, 1329, 171, 1.2, 0.15]],
  ['cumin', 'Ground cumin', SPICES, ['cumin'], 2, 96, [375, 17.8, 44, 22, 2.3, 10.5, 64, 7.7, 0, 0, 931, 66, 1788, 366, 4.8, 0.2]],
  ['cinnamon', 'Cinnamon', SPICES, ['cinnamon'], 3, 125, [247, 4, 81, 1.2, 2.2, 53, 15, 3.8, 0, 0, 1002, 8.3, 431, 60, 1.8, 0.01]],
  ['maple-syrup', 'Maple syrup', PANTRY, ['maple syrup', 'agave'], 20, 315, [260, 0, 67, 0.1, 60, 0, 0, 0, 0, 0, 102, 0.1, 212, 21, 1.5, 0]],
  ['cauliflower', 'Cauliflower', PRODUCE, ['cauliflower', 'cauliflower rice', 'riced cauliflower'], 575, 107, [25, 1.9, 5, 0.3, 1.9, 2, 0, 48, 0, 0, 22, 0.4, 299, 15, 0.3, 0.04], 'heads'],
  ['zucchini', 'Zucchini', PRODUCE, ['zucchini', 'courgette', 'zucchini noodles', 'zoodles'], 200, 124, [17, 1.2, 3.1, 0.3, 2.5, 1, 10, 18, 0, 0, 16, 0.4, 261, 18, 0.3, 0.03], 'pcs'],
  ['romaine', 'Romaine lettuce', PRODUCE, ['romaine', 'lettuce', 'lettuce leaves'], 10, 47, [17, 1.2, 3.3, 0.3, 1.2, 2.1, 436, 4, 0, 0, 33, 1, 247, 14, 0.2, 0.1]],
];

const FOOD_DB = Object.fromEntries(
  FOOD_ROWS.map(([id, name, aisle, aliases, gPerUnit, gPerCup, values, count, gPerCan]) => [
    id,
    {
      id,
      name,
      aisle,
      aliases,
      gPerUnit,
      gPerCup,
      count,
      gPerCan: gPerCan ?? 400,
      nutrients: Object.fromEntries(NUTRIENT_KEYS.map((key, i) => [key, values[i]])),
    },
  ]),
);


/* ---------- Dietary restrictions: allergies + diet patterns ---------- */

/**
 * Every exclusion the SubstitutionEngine understands. Allergens are chosen
 * directly by the user; the remaining categories are implied by diet patterns.
 */
const RESTRICTIONS = {
  peanuts: { label: 'Peanuts', option: 'Peanuts' },
  tree_nuts: { label: 'Tree nuts', option: 'Tree nuts' },
  dairy: { label: 'Dairy', option: 'Dairy / lactose' },
  gluten: { label: 'Gluten', option: 'Gluten' },
  soy: { label: 'Soy', option: 'Soy' },
  eggs: { label: 'Eggs', option: 'Eggs' },
  shellfish: { label: 'Shellfish', option: 'Shellfish' },
  meat: { label: 'Meat & poultry' },
  fish: { label: 'Fish' },
  honey: { label: 'Honey' },
  grains: { label: 'Grains' },
  legumes: { label: 'Legumes' },
  starch: { label: 'Starchy vegetables' },
  sugar: { label: 'Sugars & syrups' },
  high_carb_fruit: { label: 'High-carb fruit' },
};
const ALLERGY_IDS = ['peanuts', 'tree_nuts', 'dairy', 'gluten', 'soy', 'eggs', 'shellfish'];

const DIETS = {
  omnivore: { label: 'Omnivore', description: 'Everything on the menu.', excludes: [] },
  vegetarian: { label: 'Vegetarian', description: 'No meat, poultry or seafood.', excludes: ['meat', 'fish', 'shellfish'] },
  vegan: { label: 'Vegan', description: 'No animal products, including dairy, eggs and honey.', excludes: ['meat', 'fish', 'shellfish', 'dairy', 'eggs', 'honey'] },
  pescatarian: { label: 'Pescatarian', description: 'Seafood, but no meat or poultry.', excludes: ['meat'] },
  keto: { label: 'Keto', description: 'Very low carb: no grains, legumes, starches or sugars.', excludes: ['grains', 'legumes', 'starch', 'sugar', 'high_carb_fruit'] },
  paleo: { label: 'Paleo', description: 'No grains, legumes or dairy.', excludes: ['grains', 'legumes', 'dairy'] },
};

/** Restriction tags on dictionary foods (oats are tagged gluten for cross-contact). */
const FOOD_TAGS = {
  'peanut-butter': ['peanuts', 'legumes'],
  'almond-butter': ['tree_nuts'],
  almonds: ['tree_nuts'],
  walnuts: ['tree_nuts'],
  'almond-milk': ['tree_nuts'],
  milk: ['dairy'],
  'greek-yogurt': ['dairy'],
  'cottage-cheese': ['dairy'],
  cheddar: ['dairy'],
  butter: ['dairy'],
  oats: ['gluten', 'grains'],
  'gf-oats': ['grains'],
  'oat-milk': ['grains'],
  bread: ['gluten', 'grains'],
  'gf-bread': ['grains'],
  pasta: ['gluten', 'grains'],
  'gf-pasta': ['grains'],
  'brown-rice': ['grains'],
  quinoa: ['grains'],
  'soy-sauce': ['soy', 'gluten', 'legumes'],
  tofu: ['soy', 'legumes'],
  'soy-milk': ['soy', 'legumes'],
  eggs: ['eggs'],
  chicken: ['meat'],
  beef: ['meat'],
  salmon: ['fish'],
  tuna: ['fish'],
  sardines: ['fish'],
  shrimp: ['shellfish'],
  lentils: ['legumes'],
  'black-beans': ['legumes'],
  chickpeas: ['legumes'],
  honey: ['honey', 'sugar'],
  'maple-syrup': ['sugar'],
  'sweet-potato': ['starch'],
  banana: ['high_carb_fruit'],
  apple: ['high_carb_fruit'],
  orange: ['high_carb_fruit'],
};
Object.values(FOOD_DB).forEach((food) => { food.tags = FOOD_TAGS[food.id] ?? []; });

/** Fallback keywords for ingredients the dictionary does not recognize. */
const RESTRICTION_KEYWORDS = {
  peanuts: ['peanut', 'groundnut'],
  tree_nuts: ['cashew', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'pine nut', 'brazil nut', 'praline', 'marzipan', 'nutella'],
  dairy: ['cream', 'ghee', 'whey', 'casein', 'parmesan', 'mozzarella', 'ricotta', 'buttermilk', 'kefir', 'custard'],
  gluten: ['wheat', 'flour', 'barley', 'rye', 'couscous', 'semolina', 'bulgur', 'farro', 'spelt', 'seitan', 'breadcrumb', 'panko', 'cracker'],
  soy: ['soy', 'edamame', 'tempeh', 'miso'],
  eggs: ['egg', 'mayonnaise', 'mayo', 'meringue', 'aioli'],
  shellfish: ['prawn', 'crab', 'lobster', 'scallop', 'clam', 'mussel', 'oyster', 'crawfish', 'langoustine'],
  meat: ['bacon', 'ham', 'pork', 'lamb', 'turkey', 'sausage', 'prosciutto', 'salami', 'chorizo', 'veal', 'duck', 'venison', 'pepperoni', 'gelatin'],
  fish: ['fish', 'cod', 'tilapia', 'halibut', 'trout', 'anchovy', 'anchovies', 'mackerel', 'haddock'],
  honey: ['honey'],
  grains: ['flour', 'wheat', 'barley', 'rye', 'couscous', 'cornmeal', 'millet', 'bulgur', 'farro', 'spelt', 'cereal', 'granola', 'cracker'],
  legumes: ['bean', 'pea', 'edamame', 'tempeh', 'miso', 'hummus'],
  starch: ['potato', 'corn', 'plantain', 'cassava', 'parsnip'],
  sugar: ['sugar', 'syrup', 'agave', 'molasses', 'chocolate', 'jam'],
  high_carb_fruit: ['mango', 'grape', 'pineapple', 'date', 'raisin', 'fig'],
};
const RESTRICTION_PATTERNS = Object.fromEntries(Object.entries(RESTRICTION_KEYWORDS)
  .map(([id, words]) => [id, new RegExp(`\\b(?:${words.join('|')})(?:e?s)?\\b`)]));

/**
 * Safe, nutritionally similar substitutes per restriction. `foodId` links to the
 * dictionary so swaps keep accurate nutrition and reach the grocery list
 * (`null` means "omit"). `replaces` limits an option to specific source foods;
 * options without it are generic fallbacks. `gramRatio` scales the original weight.
 * The engine skips any option that conflicts with another active restriction.
 */
const SUBSTITUTES = {
  peanuts: [
    { foodId: 'sunflower-butter', ratio: '1:1', gramRatio: 1, replaces: ['peanut-butter'], note: 'Provides healthy fats and a similar creamy texture.' },
    { foodId: 'pumpkin-seeds', ratio: '1:1', gramRatio: 1, note: 'Matches the crunch and adds magnesium and zinc.' },
  ],
  tree_nuts: [
    { foodId: 'sunflower-butter', ratio: '1:1', gramRatio: 1, replaces: ['almond-butter'], note: 'Seed butter with the same spreadable texture and healthy fats.' },
    { foodId: 'oat-milk', ratio: '1:1', gramRatio: 1, replaces: ['almond-milk'], note: 'Fortified oat milk keeps calcium and vitamin D without nuts.' },
    { foodId: 'soy-milk', ratio: '1:1', gramRatio: 1, replaces: ['almond-milk'], note: 'Fortified soy milk keeps calcium and adds protein.' },
    { foodId: 'sunflower-seeds', ratio: '1:1', gramRatio: 1, note: 'Toasted seeds replace walnuts or pine nuts in pestos and salads.' },
    { foodId: 'hemp-seeds', ratio: '1:1', gramRatio: 1, note: 'Rich in healthy fats, omega-3 and complete protein.' },
  ],
  dairy: [
    { foodId: 'nutritional-yeast', ratio: '1 tbsp per 1/4 cup cheese', gramRatio: 0.18, replaces: ['cheddar'], note: 'Replaces cheesy, umami flavor in savory dishes and adds B12.' },
    { foodId: 'olive-oil', ratio: '3/4 the amount', gramRatio: 0.75, replaces: ['butter'], note: 'Heart-healthy fat for cooking and roasting.' },
    { foodId: 'coconut-yogurt', ratio: '1:1', gramRatio: 1, replaces: ['greek-yogurt', 'cottage-cheese'], note: 'Creamy, calcium-fortified yogurt; much lower in protein, so pair with seeds.' },
    { foodId: 'soy-milk', ratio: '1:1', gramRatio: 1, note: 'Fortified soy milk is the closest match to dairy milk for protein and calcium.' },
    { foodId: 'oat-milk', ratio: '1:1', gramRatio: 1, note: 'Fortified oat milk replaces milk while maintaining calcium and vitamin D.' },
    { foodId: 'almond-milk', ratio: '1:1', gramRatio: 1, note: 'Fortified almond milk keeps calcium with very few calories.' },
  ],
  gluten: [
    { foodId: 'gf-oats', ratio: '1:1', gramRatio: 1, replaces: ['oats'], note: 'Certified gluten-free oats avoid wheat cross-contact with identical nutrition.' },
    { foodId: 'gf-bread', ratio: '1:1', gramRatio: 1, replaces: ['bread'], note: 'Gluten-free loaf for toast and sandwiches.' },
    { foodId: 'gf-pasta', ratio: '1:1', gramRatio: 1, replaces: ['pasta'], note: 'Brown rice pasta keeps complex carbohydrates high.' },
    { foodId: 'coconut-aminos', ratio: '1:1', gramRatio: 1, replaces: ['soy-sauce'], note: 'Wheat- and soy-free seasoning with a similar savory taste.' },
    { foodId: 'quinoa', ratio: '1:1', gramRatio: 1, note: 'Naturally gluten-free grain that keeps complex carbs and adds protein.' },
    { foodId: 'cauliflower', ratio: '1:1', gramRatio: 1, note: 'Riced cauliflower stands in for grains in bowls and stir-fries.' },
  ],
  soy: [
    { foodId: 'coconut-aminos', ratio: '1:1', gramRatio: 1, replaces: ['soy-sauce'], note: 'Soy-free seasoning with a similar savory taste.' },
    { foodId: 'oat-milk', ratio: '1:1', gramRatio: 1, replaces: ['soy-milk'], note: 'Fortified oat milk keeps calcium and vitamin D.' },
    { foodId: 'almond-milk', ratio: '1:1', gramRatio: 1, replaces: ['soy-milk'], note: 'Fortified almond milk keeps calcium and vitamin D.' },
    { foodId: 'chicken', ratio: '1:1', gramRatio: 1, replaces: ['tofu'], note: 'Lean protein that cooks like pressed tofu.' },
    { foodId: 'chickpeas', ratio: '1:1', gramRatio: 1, note: 'Plant protein that holds its shape in bowls and curries.' },
    { foodId: 'hemp-seeds', ratio: '1/3 the amount', gramRatio: 0.33, note: 'Complete plant protein without soy.' },
  ],
  eggs: [
    { foodId: 'tofu', ratio: '1:1 by weight', gramRatio: 1, replaces: ['eggs'], note: 'Crumbled firm tofu makes a protein-rich, egg-free scramble.' },
    { foodId: 'chia', ratio: '1 tbsp chia + 3 tbsp water per egg', gramRatio: 0.24, note: 'A “chia egg” binds baked goods and adds omega-3.' },
  ],
  shellfish: [
    { foodId: 'chicken', ratio: '1:1', gramRatio: 1, note: 'Lean, mild protein that cooks just as quickly.' },
    { foodId: 'tofu', ratio: '1:1', gramRatio: 1, note: 'Firm tofu absorbs the same marinades and seasonings.' },
    { foodId: 'chickpeas', ratio: '1:1', gramRatio: 1, note: 'Shellfish-free protein for bowls and pastas.' },
  ],
  meat: [
    { foodId: 'tofu', ratio: '1:1 by weight', gramRatio: 1, note: 'Complete plant protein with calcium and iron.' },
    { foodId: 'chickpeas', ratio: '1:1 by weight', gramRatio: 1, note: 'Fiber-rich plant protein that roasts well.' },
    { foodId: 'mushroom', ratio: '1:1 by weight', gramRatio: 1, note: 'Meaty texture and umami with very few calories; add seeds for protein.' },
  ],
  fish: [
    { foodId: 'tofu', ratio: '1:1 by weight', gramRatio: 1, note: 'Plant protein; add chia or walnuts to replace omega-3.' },
    { foodId: 'chickpeas', ratio: '1:1 by weight', gramRatio: 1, note: 'Plant protein; add chia or hemp seeds to replace omega-3.' },
    { foodId: 'mushroom', ratio: '1:1 by weight', gramRatio: 1, note: 'Savory, low-calorie stand-in; add hemp seeds for omega-3.' },
  ],
  honey: [
    { foodId: 'maple-syrup', ratio: '1:1', gramRatio: 1, replaces: ['honey'], note: 'Plant-based sweetener with a similar pour.' },
    { foodId: null, ratio: 'omit', gramRatio: 0, note: 'Leave it out or sweeten with ripe fruit.' },
  ],
  sugar: [
    { foodId: null, ratio: 'omit', gramRatio: 0, note: 'Leave it out or use a zero-calorie sweetener to taste.' },
  ],
  grains: [
    { foodId: 'chia', ratio: '1/2 the amount', gramRatio: 0.5, replaces: ['oats', 'gf-oats'], note: 'Chia pudding replaces oats with fiber and omega-3.' },
    { foodId: 'almond-milk', ratio: '1:1', gramRatio: 1, replaces: ['oat-milk'], note: 'Grain-free fortified milk.' },
    { foodId: 'zucchini', ratio: '1:1', gramRatio: 1, replaces: ['pasta', 'gf-pasta'], note: 'Spiralized zucchini noodles replace pasta.' },
    { foodId: 'romaine', ratio: '2 leaves per slice', gramRatio: 0.6, replaces: ['bread', 'gf-bread'], note: 'Crisp lettuce wraps replace bread.' },
    { foodId: 'cauliflower', ratio: '1:1 (cooked volume)', gramRatio: 2.5, note: 'Riced cauliflower replaces rice and grains.' },
  ],
  legumes: [
    { foodId: 'sunflower-butter', ratio: '1:1', gramRatio: 1, replaces: ['peanut-butter'], note: 'Legume-free seed butter with similar fats.' },
    { foodId: 'coconut-aminos', ratio: '1:1', gramRatio: 1, replaces: ['soy-sauce'], note: 'Legume-free savory seasoning.' },
    { foodId: 'almond-milk', ratio: '1:1', gramRatio: 1, replaces: ['soy-milk'], note: 'Legume-free fortified milk.' },
    { foodId: 'chicken', ratio: '1:1', gramRatio: 1, replaces: ['tofu'], note: 'Lean protein in place of tofu.' },
    { foodId: 'mushroom', ratio: '1:1 by weight', gramRatio: 1, note: 'Hearty, low-carb stand-in for beans and lentils.' },
    { foodId: 'cauliflower', ratio: '1:1 by weight', gramRatio: 1, note: 'Low-carb bulk for soups and bowls.' },
  ],
  starch: [
    { foodId: 'cauliflower', ratio: '1:1', gramRatio: 1, note: 'Roasted or mashed cauliflower replaces starchy vegetables.' },
  ],
  high_carb_fruit: [
    { foodId: 'strawberries', ratio: '1:1', gramRatio: 1, note: 'Lower-sugar berries keep the sweetness and vitamin C.' },
    { foodId: null, ratio: 'omit', gramRatio: 0, note: 'Leave it out.' },
  ],
};

/** Alias index sorted longest-first so "peanut butter" wins over "butter". */
const ALIAS_INDEX = Object.values(FOOD_DB)
  .flatMap((food) => food.aliases.map((alias) => ({
    id: food.id,
    length: alias.length,
    pattern: new RegExp(`\\b${alias}(?:e?s)?\\b`),
  })))
  .sort((a, b) => b.length - a.length);

const UNIT_ALIASES = {
  g: ['g', 'gr', 'gram', 'grams'],
  kg: ['kg', 'kgs', 'kilogram', 'kilograms'],
  oz: ['oz', 'ounce', 'ounces'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
  ml: ['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  l: ['l', 'liter', 'liters', 'litre', 'litres'],
  cup: ['c', 'cup', 'cups'],
  tbsp: ['tbsp', 'tbsps', 'tbs', 'tablespoon', 'tablespoons'],
  tsp: ['tsp', 'tsps', 'teaspoon', 'teaspoons'],
  can: ['can', 'cans', 'tin', 'tins'],
  pinch: ['pinch', 'pinches', 'dash', 'dashes'],
  unit: ['piece', 'pieces', 'pc', 'pcs', 'whole', 'large', 'medium', 'small', 'clove', 'cloves',
    'slice', 'slices', 'fillet', 'fillets', 'bunch', 'bunches', 'head', 'heads', 'stalk', 'stalks', 'scoop', 'scoops'],
};
const UNIT_LOOKUP = Object.fromEntries(
  Object.entries(UNIT_ALIASES).flatMap(([unit, aliases]) => aliases.map((alias) => [alias, unit])),
);
const WEIGHT_GRAMS = { g: 1, kg: 1000, oz: 28.35, lb: 453.6 };
const UNICODE_FRACTIONS = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8' };
const LIST_MARKER = /^\s*(?:[-*•–]|\d+[.)](?=\s))\s*/;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = Object.fromEntries(DAYS.map((d) => [d, d[0].toUpperCase() + d.slice(1)]));

const MEAL_SLOTS = [
  { id: 'breakfast', label: 'Breakfast', time: '07:30', display: '7:30 AM' },
  { id: 'lunch', label: 'Lunch', time: '12:30', display: '12:30 PM' },
  { id: 'dinner', label: 'Dinner', time: '19:00', display: '7:00 PM' },
];
const SLOT_BY_ID = Object.fromEntries(MEAL_SLOTS.map((s) => [s.id, s]));

const SUPPLEMENTS = [
  { id: 'vitaminD3', label: 'Vitamin D3', fatSoluble: true },
  { id: 'vitaminA', label: 'Vitamin A', fatSoluble: true },
  { id: 'vitaminE', label: 'Vitamin E', fatSoluble: true },
  { id: 'vitaminK', label: 'Vitamin K2', fatSoluble: true },
  { id: 'omega3', label: 'Omega-3 (fish or algae oil)', fatSoluble: true },
  { id: 'multivitamin', label: 'Multivitamin', fatSoluble: true },
  { id: 'iron', label: 'Iron' },
  { id: 'vitaminC', label: 'Vitamin C' },
  { id: 'calcium', label: 'Calcium' },
  { id: 'magnesium', label: 'Magnesium glycinate' },
  { id: 'zinc', label: 'Zinc' },
  { id: 'vitaminB12', label: 'Vitamin B12' },
];
const SUPPLEMENT_BY_ID = Object.fromEntries(SUPPLEMENTS.map((s) => [s.id, s]));

const SEED_RECIPES = [
  {
    id: 'seed-oats', title: 'Berry Chia Overnight Oats', servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredientsText: '1/2 cup rolled oats\n1/2 cup milk\n1/2 cup greek yogurt\n1 tbsp chia seeds\n1/2 cup blueberries\n1 tsp honey',
    instructions: 'Stir everything together in a jar.\nRefrigerate overnight and serve cold.',
  },
  {
    id: 'seed-scramble', title: 'Garden Veggie Egg Scramble', servings: 1, prepMinutes: 5, cookMinutes: 8,
    ingredientsText: '3 large eggs\n1 cup spinach\n1/2 red bell pepper, diced\n1 slice whole wheat bread\n1 tsp olive oil',
    instructions: 'Sauté pepper in oil for 3 minutes.\nAdd spinach until wilted, then scramble in the eggs.\nServe with toast.',
  },
  {
    id: 'seed-salmon', title: 'Lemon Herb Salmon & Quinoa', servings: 2, prepMinutes: 10, cookMinutes: 15,
    ingredientsText: '2 salmon fillets\n1/2 cup quinoa\n2 cups broccoli\n1 tbsp olive oil\n1 lemon\n2 cloves garlic, minced',
    instructions: 'Cook quinoa in 1 cup water for 15 minutes.\nRoast salmon and broccoli with oil, garlic and lemon at 200°C for 14 minutes.',
  },
  {
    id: 'seed-soup', title: 'Lentil & Spinach Soup', servings: 4, prepMinutes: 10, cookMinutes: 25,
    ingredientsText: '1 cup red lentils\n4 cups vegetable broth\n1 onion, chopped\n2 carrots, diced\n3 cloves garlic\n3 cups spinach\n1 can diced tomatoes\n1 tsp cumin\n1 tbsp olive oil\n1/2 tsp salt',
    instructions: 'Soften onion, carrot and garlic in oil.\nAdd lentils, broth, tomatoes and cumin; simmer 20 minutes.\nStir in spinach and salt.',
  },
  {
    id: 'seed-chicken', title: 'Roast Chicken & Sweet Potato Plate', servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredientsText: '300 g chicken breast\n2 sweet potatoes, cubed\n2 cups broccoli\n1 tbsp olive oil\n1/2 tsp black pepper',
    instructions: 'Toss everything with oil and pepper.\nRoast at 210°C for 25 minutes.',
  },
  {
    id: 'seed-bowl', title: 'Black Bean Burrito Bowl', servings: 2, prepMinutes: 10, cookMinutes: 25,
    ingredientsText: '1 can black beans, drained\n1/2 cup brown rice\n1 avocado\n1 tomato, diced\n1/4 cup cheddar cheese\n1/2 onion\n1 tsp cumin\n1 lime',
    instructions: 'Cook rice.\nWarm beans with cumin.\nAssemble bowls with avocado, tomato, onion, cheese and lime.',
  },
  {
    id: 'seed-yogurt', title: 'Greek Yogurt Seed Crunch', servings: 1, category: 'snack', prepMinutes: 5, cookMinutes: 0,
    ingredientsText: '1 cup greek yogurt\n1/2 cup strawberries\n1 tbsp pumpkin seeds\n1 tbsp walnuts',
    instructions: 'Layer yogurt, berries, seeds and walnuts in a bowl.',
  },
  {
    id: 'seed-apple', title: 'Apple & Peanut Butter', servings: 1, category: 'snack', prepMinutes: 3, cookMinutes: 0,
    ingredientsText: '1 apple, sliced\n2 tbsp peanut butter\n1 pinch cinnamon',
    instructions: 'Slice apple and serve with peanut butter dusted with cinnamon.',
  },
  {
    id: 'seed-juice', title: 'Orange Ginger Sunrise Juice', servings: 2, category: 'drink', prepMinutes: 10, cookMinutes: 0,
    ingredientsText: '1/4 cup orange juice\n3 tbsp lemon juice\n1 small apple, cored and quartered\n1 tbsp fresh ginger, peeled\n4 whole carrots',
    instructions: 'Juice the apple, ginger and carrots.\nStir in the orange and lemon juice and serve over ice.',
  },
  {
    id: 'seed-broccoli', title: 'Garlic Roasted Broccoli', servings: 2, category: 'side', prepMinutes: 5, cookMinutes: 15,
    ingredientsText: '3 cups broccoli florets\n1 tbsp olive oil\n2 cloves garlic, sliced\n1 pinch salt',
    instructions: 'Toss everything together and roast at 220°C for 15 minutes.',
  },
  {
    id: 'seed-pudding', title: 'Strawberry Chia Pudding', servings: 2, category: 'dessert', prepMinutes: 5, cookMinutes: 0,
    ingredientsText: '1 cup milk\n3 tbsp chia seeds\n1 cup strawberries\n1 tsp honey',
    instructions: 'Whisk milk, chia and honey; chill for 4 hours.\nTop with sliced strawberries.',
  },
];

/** Course types for dishes; several dishes can be stacked in one meal slot. */
const COURSES = {
  drink: { label: 'Drink', plural: 'Drinks' },
  main: { label: 'Main dish', plural: 'Main Dishes' },
  side: { label: 'Side dish', plural: 'Side Dishes' },
  dessert: { label: 'Dessert', plural: 'Desserts' },
  snack: { label: 'Snack', plural: 'Snacks' },
};

/** Decorative course icons (24×24 line art); always paired with a visible course label. */
const COURSE_ICONS = {
  drink: '<path d="M7 3h10l-1.5 17a1 1 0 0 1-1 .9h-5a1 1 0 0 1-1-.9L7 3Zm.4 5h9.2M14 3l2-2"/>',
  main: '<circle cx="12" cy="13" r="7"/><circle cx="12" cy="13" r="3.5"/><path d="M3 4v6m0 0v11M5 4v4a2 2 0 0 1-4 0V4M21 4c-2 1-2 5-2 7h2v10"/>',
  side: '<path d="M4 20C4 11 10 5 20 4c0 10-6 16-16 16Zm0 0 9-9"/>',
  dessert: '<path d="M4 12h16v8H4zM4 16h16M8 12V9a4 4 0 0 1 8 0v3M12 5V3"/>',
  snack: '<path d="M12 7c-3-2-8-1-8 5 0 5 3 9 5 9 1 0 2-1 3-1s2 1 3 1c2 0 5-4 5-9 0-6-5-7-8-5Zm0 0c0-2 1-4 3-4"/>',
};
const courseIcon = (kind) => `<svg class="course-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${COURSE_ICONS[kind]}</svg>`;
const courseBadge = (kind) => `<span class="course-badge course-badge--${kind}">${courseIcon(kind)}${COURSES[kind].label}</span>`;
const formatMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h ? `${h} h ` : ''}${m ? `${m} min` : ''}`.trim();
};

/** "Prep 10 min · Cook 15 min"; a cook time of 0 reads "No cooking". */
const formatTimes = ({ prepMinutes, cookMinutes }) => {
  const parts = [];
  if (prepMinutes) parts.push(`Prep ${formatMinutes(prepMinutes)}`);
  if (cookMinutes === 0) parts.push('No cooking');
  else if (cookMinutes) parts.push(`Cook ${formatMinutes(cookMinutes)}`);
  return parts.join(' · ') || 'Times not set';
};
const courseOf = (recipe) => recipe.category ?? 'main';

/** Seed week: plan[day][slot] is a list of { recipeId, kind } dishes. */
const SEED_PLAN = (() => {
  const dish = (recipeId, kind = 'main') => ({ recipeId, kind });
  // Built per day so no two days share (and accidentally co-edit) the same lists.
  const rotation = (even) => (even
    ? { breakfast: [dish('seed-oats'), dish('seed-juice', 'drink')], lunch: [dish('seed-bowl'), dish('seed-yogurt', 'snack')], dinner: [dish('seed-salmon'), dish('seed-broccoli', 'side')] }
    : { breakfast: [dish('seed-scramble')], lunch: [dish('seed-soup'), dish('seed-apple', 'snack')], dinner: [dish('seed-chicken'), dish('seed-pudding', 'dessert')] });
  return Object.fromEntries(DAYS.map((day, i) => [day, rotation(i % 2 === 0)]));
})();

/**
 * Upgrades older saved plans: one recipe id per slot becomes a dish list, and the
 * former Afternoon Snack slot is folded into lunch as snack-course dishes.
 */
const normalizePlan = (plan) => {
  const toDishes = (value, kind = 'main') => {
    if (Array.isArray(value)) return value;
    return value ? [{ recipeId: value, kind }] : [];
  };
  return Object.fromEntries(DAYS.map((day) => {
    const slots = Object.fromEntries(MEAL_SLOTS.map((slot) => [slot.id, toDishes(plan?.[day]?.[slot.id])]));
    const snacks = toDishes(plan?.[day]?.snack, 'snack').map((d) => ({ ...d, kind: d.kind === 'main' ? 'snack' : d.kind }));
    slots.lunch = [...slots.lunch, ...snacks];
    return [day, slots];
  }));
};

/** Deterministic sample texts returned by the simulated OCR step. */
const OCR_SAMPLES = [
  'Title: Kale & Chickpea Power Salad\nServings: 2\nPrep time: 20 min\nCook time: 15 min\nIngredients:\n- 3 cups kale\n- 1 can chickpeas, drained\n- 1/2 cup quinoa\n- 1 red bell pepper\n- 2 tbsp olive oil\n- 1 lemon\n- 2 tbsp pumpkin seeds\nInstructions:\n1. Cook quinoa and let it cool.\n2. Massage kale with oil and lemon.\n3. Toss with chickpeas, pepper, quinoa and seeds.',
  'Title: Sheet-Pan Salmon & Sweet Potato\nServes 2\nPrep time: 10 minutes\nCook time: 27 minutes\nIngredients\n• 2 salmon fillets (6 oz each)\n• 2 sweet potatoes\n• 2 cups broccoli\n• 1 tbsp olive oil\n• 1/2 tsp black pepper\nDirections\n1. Cube the sweet potatoes and roast 15 minutes at 220°C.\n2. Add salmon and broccoli; roast 12 minutes more.',
  'Title: Peanut Butter Banana Oat Smoothie\nServings: 1\nPrep: 5 min\nCook: none\nIngredients:\n- 1 banana\n- 1 cup milk\n- 1/4 cup rolled oats\n- 1 tbsp peanut butter\n- 1 tsp chia seeds\nInstructions:\n1. Blend everything until smooth.',
];

const DEFAULT_PROFILE = {
  units: 'imperial', age: null, sex: 'female', heightCm: null, weightKg: null,
  activity: 'moderate', goal: 'maintain', timelineWeeks: 12, diet: 'omnivore', allergies: [],
  bodyFatPct: null, waistCm: null, hipCm: null, leanMassKg: null,
  onboarded: false, onboardingStep: 1, updatedAt: null,
};
const DEFAULT_SUPPLEMENTS = { selected: ['vitaminD3', 'iron', 'magnesium'], coffeeAtBreakfast: true };
const DEFAULT_GROCERY = { household: 1, checked: [] };
const DEFAULT_UI = { tab: 'tab-dashboard', shelfOpen: true };

/* =========================================================
 * 2. Utilities & Storage
 * ======================================================= */

const $ = (selector, root = document) => root.querySelector(selector);

const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

/** Formats numbers with sensible precision for display. */
const fmt = (value) => {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 1 : 2;
  return Number(value.toFixed(digits)).toLocaleString('en-US');
};

const emptyNutrients = () => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
const addNutrients = (a, b) => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, a[k] + b[k]]));
const scaleNutrients = (n, factor) => Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, n[k] * factor]));

const createId = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const todayKey = () => DAYS[(new Date().getDay() + 6) % 7];

/**
 * localStorage wrapper. User data keys are namespaced per signed-in account
 * ("ubecafe.user:<email>.plan"). Device-wide keys (theme, account registry,
 * session) are never namespaced.
 */
const Storage = {
  KEYS: {
    profile: 'ubecafe.profile',
    recipes: 'ubecafe.recipes',
    plan: 'ubecafe.plan',
    supplements: 'ubecafe.supplements',
    grocery: 'ubecafe.grocery',
    ui: 'ubecafe.ui',
    theme: 'ubecafe.theme',
    accounts: 'ubecafe.accounts',
    session: 'ubecafe.session',
  },
  GLOBAL_KEYS: new Set(['ubecafe.theme', 'ubecafe.accounts', 'ubecafe.session']),
  scope: null,

  resolve(key) {
    return this.scope && !this.GLOBAL_KEYS.has(key) ? key.replace('ubecafe.', `ubecafe.user:${this.scope}.`) : key;
  },
  /** Returns the stored value, or a deep copy of `fallback` so shared defaults are never mutated. */
  load(key, fallback) {
    try {
      const raw = localStorage.getItem(this.resolve(key));
      if (raw) return JSON.parse(raw);
    } catch {
      /* Storage blocked or corrupt: use the fallback. */
    }
    return structuredClone(fallback);
  },
  save(key, value) {
    try {
      localStorage.setItem(this.resolve(key), JSON.stringify(value));
    } catch {
      /* Storage blocked (private mode / quota): the app keeps working in memory. */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(this.resolve(key));
    } catch {
      /* Nothing to remove when storage is unavailable. */
    }
  },
  /** Deletes every key belonging to one account. */
  removeScope(scope) {
    try {
      const prefix = `ubecafe.user:${scope}.`;
      Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
    } catch {
      /* Nothing to remove when storage is unavailable. */
    }
  },
};

/** Sends a short message to the global polite live region for screen readers. */
const announce = (message) => {
  const region = $('#app-status');
  region.textContent = '';
  window.setTimeout(() => { region.textContent = message; }, 50);
};


/* =========================================================
 * 3. NutritionEngine – energy, macro, micro and body-composition targets
 * ======================================================= */

class NutritionEngine {
  static ACTIVITY_FACTORS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, athlete: 1.9 };

  static GOALS = {
    loss: { label: 'Weight loss', proteinPerKg: 1.8, fatShare: 0.3 },
    maintain: { label: 'Maintenance', proteinPerKg: 1.4, fatShare: 0.3 },
    gain: { label: 'Muscle gain', proteinPerKg: 2.0, fatShare: 0.25 },
  };

  /** Shorter timelines use a larger (but capped) energy adjustment. */
  static TIMELINES = [4, 8, 12, 16, 24];

  static pace(weeks) {
    if (weeks <= 8) return { label: 'Accelerated', loss: 0.75, gain: 1.15 };
    if (weeks <= 12) return { label: 'Moderate', loss: 0.8, gain: 1.1 };
    return { label: 'Gradual', loss: 0.85, gain: 1.05 };
  }

  /** Mifflin-St Jeor: 10·kg + 6.25·cm − 5·age + s (s = +5 male, −161 female, −78 averaged). */
  static bmr({ weightKg, heightCm, age, sex }) {
    const sexOffset = { male: 5, female: -161, other: -78 }[sex];
    return 10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset;
  }

  static calculate(profile) {
    const bmr = this.bmr(profile);
    const tdee = bmr * this.ACTIVITY_FACTORS[profile.activity];
    const goal = this.GOALS[profile.goal];
    const pace = this.pace(profile.timelineWeeks);
    const factor = profile.goal === 'maintain' ? 1 : pace[profile.goal];
    const calorieFloor = profile.sex === 'male' ? 1500 : 1200;
    const calories = Math.max(calorieFloor, Math.round(tdee * factor));
    const protein = Math.round(profile.weightKg * goal.proteinPerKg);

    // Keto caps net carbs at 30 g and fills the remaining energy with fat.
    let carbs;
    let fat;
    if (profile.diet === 'keto') {
      carbs = 30;
      fat = Math.max(0, Math.round((calories - protein * 4 - carbs * 4) / 9));
    } else {
      fat = Math.round((calories * goal.fatShare) / 9);
      carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
    }
    const sugar = Math.min(carbs, Math.round((calories * 0.1) / 4)); // WHO: free sugars < 10 % of energy

    // ~7,700 kcal per kg of body weight change.
    const weeklyKg = ((calories - tdee) * 7) / 7700;
    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      pace: profile.goal === 'maintain' ? null : pace.label,
      projectedKg: profile.goal === 'maintain' ? 0 : weeklyKg * profile.timelineWeeks,
      targets: {
        calories, protein, carbs, fat, sugar,
        fiber: Math.round((14 * calories) / 1000), // IOM: 14 g per 1,000 kcal
        ...this.micronutrientRDA(profile.age, profile.sex),
      },
    };
  }

  /**
   * Body-composition indicators (WHO cut-offs). BMI always; waist ratios when tape
   * measurements exist; lean mass from direct entry or body fat %, plus Katch-McArdle BMR.
   */
  static bodyComposition({ heightCm, weightKg, sex, bodyFatPct, waistCm, hipCm, leanMassKg }) {
    const bmi = weightKg / (heightCm / 100) ** 2;
    let bmiCategory = 'Obesity';
    if (bmi < 18.5) bmiCategory = 'Underweight';
    else if (bmi < 25) bmiCategory = 'Healthy range';
    else if (bmi < 30) bmiCategory = 'Overweight';

    const result = { bmi, bmiCategory };
    if (waistCm && hipCm) {
      const whrLimit = { male: 0.9, female: 0.85, other: 0.875 }[sex];
      result.waistToHip = waistCm / hipCm;
      result.waistToHipRisk = result.waistToHip >= whrLimit ? 'Increased risk' : 'Low risk';
      result.waistToHipLimit = whrLimit;
    }
    if (waistCm) {
      result.waistToHeight = waistCm / heightCm;
      result.waistToHeightRisk = result.waistToHeight >= 0.5 ? 'Increased risk' : 'Low risk';
    }
    const lean = leanMassKg ?? (bodyFatPct ? weightKg * (1 - bodyFatPct / 100) : null);
    if (lean) {
      result.leanMassKg = lean;
      result.leanSource = leanMassKg ? 'Entered' : `From ${fmt(bodyFatPct)}% body fat`;
      result.katchBmr = 370 + 21.6 * lean;
    }
    return result;
  }

  /** NIH Dietary Reference Intakes (RDA / AI) by age and sex. */
  static micronutrientRDA(age, sex) {
    const teen = age < 19;
    const senior = age > 70;
    const over50 = age > 50;
    const under31 = age < 31;
    const male = {
      vitaminA: 900, vitaminC: teen ? 75 : 90, vitaminD: senior ? 20 : 15, vitaminB12: 2.4,
      calcium: teen ? 1300 : senior ? 1200 : 1000, iron: teen ? 11 : 8, potassium: teen ? 3000 : 3400,
      magnesium: teen ? 410 : under31 ? 400 : 420, zinc: 11, omega3: 1.6,
    };
    const female = {
      vitaminA: 700, vitaminC: teen ? 65 : 75, vitaminD: senior ? 20 : 15, vitaminB12: 2.4,
      calcium: teen ? 1300 : over50 ? 1200 : 1000, iron: teen ? 15 : over50 ? 8 : 18, potassium: teen ? 2300 : 2600,
      magnesium: teen ? 360 : under31 ? 310 : 320, zinc: teen ? 9 : 8, omega3: 1.1,
    };
    if (sex === 'male') return male;
    if (sex === 'female') return female;
    return Object.fromEntries(Object.keys(male).map((k) => [k, Math.round(((male[k] + female[k]) / 2) * 10) / 10]));
  }
}

/* =========================================================
 * 4. RecipeManager – recipe text + ingredient parsing and nutrition analysis
 * ======================================================= */

class RecipeManager {
  static #cache = new WeakMap();

  /** Converts "1 1/2", "3/4" or "2.5" into a number. */
  static toNumber(text) {
    return text.trim().split(/\s+/).reduce((sum, part) => {
      if (part.includes('/')) {
        const [num, den] = part.split('/').map(Number);
        return sum + (den ? num / den : 0);
      }
      return sum + Number(part);
    }, 0);
  }

  /** Reads a leading quantity (with ranges) and unit from text. */
  static parseAmount(text) {
    const number = String.raw`\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+`;
    const qtyMatch = text.match(new RegExp(`^(${number})(?:\\s*(?:-|to)\\s*(${number}))?\\s*`));
    let qty = null;
    let rest = text;
    if (qtyMatch) {
      const low = this.toNumber(qtyMatch[1]);
      qty = qtyMatch[2] ? (low + this.toNumber(qtyMatch[2])) / 2 : low;
      rest = text.slice(qtyMatch[0].length);
    }
    const unitMatch = rest.match(/^([a-zA-Z]+)\.?(?=\s|$)/);
    const unit = unitMatch ? UNIT_LOOKUP[unitMatch[1].toLowerCase()] ?? null : null;
    if (unit) rest = rest.slice(unitMatch[0].length).trim();
    return { qty, unit, rest: rest.trim() };
  }

  /** Finds the best dictionary match (longest alias) for an ingredient name. */
  static matchFood(name) {
    const normalized = ` ${name.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `;
    const hit = ALIAS_INDEX.find((entry) => entry.pattern.test(normalized));
    return hit ? FOOD_DB[hit.id] : null;
  }

  static toGrams(food, qty, unit) {
    const gPerCup = food?.gPerCup ?? 240;
    switch (unit) {
      case 'g': case 'kg': case 'oz': case 'lb': return qty * WEIGHT_GRAMS[unit];
      case 'ml': return qty * (gPerCup / 240);
      case 'l': return qty * 1000 * (gPerCup / 240);
      case 'cup': return qty * gPerCup;
      case 'tbsp': return qty * (gPerCup / 16);
      case 'tsp': return qty * (gPerCup / 48);
      case 'can': return qty * (food?.gPerCan ?? 400);
      case 'pinch': return qty * 0.4;
      default: return qty * (food?.gPerUnit ?? 100);
    }
  }

  /** Parses one ingredient line, e.g. "1 (15 oz) can black beans, drained". */
  static parseIngredientLine(rawLine) {
    const raw = rawLine.replace(LIST_MARKER, '').trim();
    const text = raw.replace(/(\d)?\s*([½⅓⅔¼¾⅛])/g, (_, whole, frac) => `${whole ? `${whole} ` : ''}${UNICODE_FRACTIONS[frac]}`);
    const amount = this.parseAmount(text);
    const qty = amount.qty ?? 1;
    let { unit, rest } = amount;

    // Package sizes in parentheses override the outer unit: "1 (15 oz) can beans".
    let packageAmount = null;
    const paren = rest.match(/^\(([^)]*)\)\s*/);
    if (paren) {
      const inner = this.parseAmount(paren[1]);
      if (inner.qty !== null && inner.unit && !inner.rest) packageAmount = inner;
      rest = this.parseAmount(rest.slice(paren[0].length)).rest;
    }

    const name = rest.replace(/^of\s+/i, '').trim() || raw;
    const food = this.matchFood(name);
    const grams = packageAmount
      ? qty * this.toGrams(food, packageAmount.qty, packageAmount.unit)
      : this.toGrams(food, qty, unit);

    return {
      raw,
      qty,
      unit,
      name,
      foodId: food?.id ?? null,
      grams,
      nutrients: food ? scaleNutrients(food.nutrients, grams / 100) : emptyNutrients(),
    };
  }

  /** Analyzes a recipe (memoized per recipe object). */
  static analyze(recipe) {
    if (this.#cache.has(recipe)) return this.#cache.get(recipe);
    const ingredients = recipe.ingredientsText
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => this.parseIngredientLine(line));
    const totals = ingredients.reduce((sum, ing) => addNutrients(sum, ing.nutrients), emptyNutrients());
    const servings = Math.max(1, Number(recipe.servings) || 1);
    const result = {
      ingredients,
      totals,
      perServing: scaleNutrients(totals, 1 / servings),
      unmatched: ingredients.filter((ing) => !ing.foodId).length,
    };
    this.#cache.set(recipe, result);
    return result;
  }

  /** Splits pasted / OCR'd text into title, servings, ingredients and instructions. */
  static parseRecipeText(text) {
    let title = '';
    let servings = null;
    let prepMinutes = null;
    let cookMinutes = null;
    let totalMinutes = null;
    let mode = null;
    const ingredients = [];
    const instructions = [];

    text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const titleMatch = line.match(/^title\s*[:-]\s*(.+)$/i);
      const servingsMatch = line.match(/^(?:servings?|serves|yield|makes)\s*[:-]?\s*(\d+)/i);
      const timeMatch = line.match(/^(prep(?:aration)?|cook(?:ing)?|total|ready in)(?:\s*time)?\s*[:-]\s*(.+)$/i);
      if (titleMatch) {
        title = titleMatch[1];
      } else if (timeMatch) {
        const hours = Number(timeMatch[2].match(/(\d+)\s*h/i)?.[1] ?? 0);
        const mins = Number(timeMatch[2].match(/(\d+)\s*m/i)?.[1] ?? 0);
        const minutes = hours * 60 + mins;
        const kind = timeMatch[1].toLowerCase();
        if (kind.startsWith('prep')) prepMinutes = minutes || null;
        else if (kind.startsWith('cook')) cookMinutes = minutes; // "Cook: none" → 0, i.e. no cooking
        else totalMinutes = minutes || null;
      } else if (servingsMatch) {
        servings = Number(servingsMatch[1]);
      } else if (/^ingredients?\s*:?$/i.test(line)) {
        mode = 'ingredients';
      } else if (/^(?:instructions?|directions?|method|steps|preparation)\s*:?$/i.test(line)) {
        mode = 'instructions';
      } else if (mode === 'ingredients') {
        ingredients.push(line.replace(LIST_MARKER, ''));
      } else if (mode === 'instructions') {
        instructions.push(line.replace(LIST_MARKER, ''));
      } else if (!title) {
        title = line;
      }
    });

    // A lone "Total time" is treated as prep when prep and cook are not given separately.
    if (prepMinutes === null && cookMinutes === null) prepMinutes = totalMinutes;
    return { title, servings: servings ?? 1, prepMinutes, cookMinutes, ingredientsText: ingredients.join('\n'), instructions: instructions.join('\n') };
  }
}


/* =========================================================
 * 5. SubstitutionEngine – allergen & diet screening with safe swaps
 * ======================================================= */

class SubstitutionEngine {
  static #cache = new WeakMap();

  /** Active restriction ids for a profile: chosen allergies plus the diet's exclusions. */
  static restrictionsFor(profile) {
    return [...new Set([...profile.allergies, ...DIETS[profile.diet].excludes])];
  }

  /** Restrictions an ingredient violates: dictionary tags, else keyword scan. */
  static detect(ingredient) {
    if (ingredient.foodId) return FOOD_DB[ingredient.foodId].tags;
    const name = ` ${ingredient.name.toLowerCase().replace(/[^a-z\s]/g, ' ')} `;
    return Object.keys(RESTRICTION_PATTERNS).filter((id) => RESTRICTION_PATTERNS[id].test(name));
  }

  /** A substitute free of every active restriction, preferring food-specific options. */
  static pickSubstitute(restriction, foodId, active) {
    const options = SUBSTITUTES[restriction] ?? [];
    const isSafe = (option) => option.foodId === null || !FOOD_DB[option.foodId].tags.some((t) => active.includes(t));
    return options.find((o) => o.replaces?.includes(foodId) && isSafe(o))
      ?? options.find((o) => !o.replaces && isSafe(o))
      ?? null;
  }

  /**
   * Screens a recipe for a profile. Every violating ingredient is swapped for a safe
   * substitute (or omitted). `isSafe` is false when an allergen has no safe option;
   * such recipes are excluded from the planner, dashboard and grocery list.
   */
  static screen(recipe, profile) {
    const analysis = RecipeManager.analyze(recipe);
    const active = this.restrictionsFor(profile);
    if (!active.length) return { ...analysis, isSafe: true, flagged: [] };

    const key = [...active].sort().join('|');
    const byKey = this.#cache.get(recipe) ?? new Map();
    this.#cache.set(recipe, byKey);
    if (byKey.has(key)) return byKey.get(key);

    const flagged = [];
    const ingredients = analysis.ingredients.map((ing) => {
      const hits = this.detect(ing).filter((t) => active.includes(t));
      if (!hits.length) return ing;
      const original = ing.foodId ? FOOD_DB[ing.foodId].name : ing.name;
      const sub = hits.map((t) => this.pickSubstitute(t, ing.foodId, active)).find(Boolean) ?? null;
      flagged.push({
        raw: ing.raw,
        original,
        hits,
        isAllergy: hits.some((t) => profile.allergies.includes(t)),
        substitute: sub && {
          name: sub.foodId ? FOOD_DB[sub.foodId].name : 'Omit',
          ratio: sub.ratio,
          note: sub.note,
        },
      });
      if (!sub) return { ...ing, blocked: true, nutrients: emptyNutrients() };
      if (sub.foodId === null) return { ...ing, omitted: true, grams: 0, nutrients: emptyNutrients(), swappedFrom: original };
      const grams = ing.grams * sub.gramRatio;
      return {
        ...ing,
        foodId: sub.foodId,
        grams,
        nutrients: scaleNutrients(FOOD_DB[sub.foodId].nutrients, grams / 100),
        swappedFrom: original,
      };
    });

    const totals = ingredients.reduce((sum, ing) => addNutrients(sum, ing.nutrients), emptyNutrients());
    const result = {
      ingredients,
      totals,
      perServing: scaleNutrients(totals, 1 / Math.max(1, Number(recipe.servings) || 1)),
      unmatched: analysis.unmatched,
      isSafe: flagged.every((f) => f.substitute),
      flagged,
    };
    byKey.set(key, result);
    return result;
  }

  /** Accessible restriction badge: icon + text + screen-reader prefix, never color alone. */
  static badge(hits, { isAllergy = true, blocked = false } = {}) {
    const labels = hits.map((t) => RESTRICTIONS[t].label).join(', ');
    const level = blocked ? 'danger' : 'warn';
    return `<span class="badge badge--${level}"><span aria-hidden="true">${blocked ? '✕' : '!'}</span><span class="sr-only">${isAllergy ? 'Allergen warning:' : 'Diet conflict:'}</span> ${labels}</span>`;
  }
}

/* =========================================================
 * 6. RecommendationEngine – explicit if/else rules
 * ======================================================= */

class RecommendationEngine {
  /** Restriction tags for foods named in recommendations (unlisted foods are unrestricted). */
  static FOOD_RESTRICTIONS = {
    'Oats with Nut Butter': ['grains', 'gluten', 'peanuts', 'tree_nuts', 'legumes'],
    'Greek Yogurt': ['dairy'],
    'Cottage Cheese': ['dairy'],
    'Plain Yogurt': ['dairy'],
    'Fortified Milk': ['dairy'],
    'Fortified Oat Milk': ['grains'],
    'Fortified Soy Milk': ['soy', 'legumes'],
    Eggs: ['eggs'],
    'Firm Tofu': ['soy', 'legumes'],
    Almonds: ['tree_nuts'],
    Walnuts: ['tree_nuts'],
    'Chicken Breast': ['meat'],
    'Lean Beef': ['meat'],
    Salmon: ['fish'],
    Sardines: ['fish'],
    'Canned Tuna': ['fish'],
    Lentils: ['legumes'],
    'Black Beans': ['legumes'],
    Chickpeas: ['legumes'],
    Banana: ['high_carb_fruit'],
    'Sweet Potato': ['starch'],
  };

  /** Removes foods that clash with active restrictions; returns the safe names and the ones left out. */
  static safeFoods(foodList, restrictions) {
    const names = foodList.split(' / ');
    const isSafe = (name) => !(this.FOOD_RESTRICTIONS[name] ?? []).some((t) => restrictions.includes(t));
    return { safe: names.filter(isSafe), removed: names.filter((n) => !isSafe(n)) };
  }

  static recommend(intake, targets, mealsPlanned, restrictions = []) {
    if (mealsPlanned === 0) {
      return [{
        food: 'Plan your first meal',
        reason: 'Add recipes to this day in the Weekly Meal Plan so the engine can compare your intake against your targets.',
        trigger: 'No meals planned',
        priority: 'info',
      }];
    }

    const recs = [];
    const ratio = (key) => (targets[key] > 0 ? intake[key] / targets[key] : 1);
    /** Adds a rule's output, swapping in `alternative` foods when every option clashes with a restriction. */
    const add = (key, foods, reason, alternative) => {
      let { safe, removed } = this.safeFoods(foods, restrictions);
      if (!safe.length && alternative) safe = this.safeFoods(alternative, restrictions).safe;
      if (!safe.length) return;
      const r = ratio(key);
      recs.push({
        food: safe.join(' / '),
        reason,
        restrictionNote: removed.length ? `Adjusted for your diet and allergies: left out ${removed.join(', ')}.` : '',
        trigger: `${NUTRIENT_BY_KEY[key].label} at ${Math.round(r * 100)}% of ${NUTRIENT_BY_KEY[key].isLimit ? 'your daily limit' : 'target'}`,
        priority: r < 0.5 || r > 1.25 ? 'high' : 'medium',
      });
    };

    // Energy balance
    if (ratio('calories') < 0.8) {
      add('calories', 'Oats with Nut Butter / Avocado', 'Nutrient-dense calories with fiber and healthy fats close your energy gap without a sugar spike.');
    } else if (ratio('calories') > 1.1) {
      add('calories', 'Leafy Greens / Broth-Based Soups', 'High-volume, low-calorie foods keep you full while trimming the day back toward your energy target.');
    }

    // Protein, with carb context
    if (ratio('protein') < 0.8 && intake.carbs >= targets.carbs) {
      add('protein', 'Greek Yogurt / Cottage Cheese', 'High-protein, low-carb boost to meet muscle protein synthesis targets.', 'Hemp Seeds / Canned Tuna');
    } else if (ratio('protein') < 0.8) {
      add('protein', 'Chicken Breast / Eggs / Firm Tofu', 'Complete protein sources that close your protein deficit while leaving room for the carbohydrates you still need.', 'Lentils / Hemp Seeds');
    }

    // Limits
    if (intake.fat > targets.fat * 1.15) {
      add('fat', 'Lean Proteins / Steamed Vegetables', 'Swap fried or oil-heavy sides for lean, steamed options to bring total fat back within range.');
    }
    if (intake.sugar > targets.sugar) {
      add('sugar', 'Fresh Berries / Plain Yogurt', 'Replace sweetened snacks with whole fruit and unsweetened dairy to cut added sugar while keeping sweetness.');
    }

    // Micronutrients
    if (ratio('fiber') < 0.7) {
      add('fiber', 'Chia Seeds / Black Beans', 'Soluble and insoluble fiber support digestion, cholesterol and steady blood sugar.');
    }
    if (ratio('iron') < 0.7) {
      add('iron', 'Spinach / Lentils', 'Provides plant-based bioavailable iron to close your current deficit without excess saturated fat.');
    }
    if (ratio('vitaminC') < 0.7) {
      add('vitaminC', 'Red Bell Pepper / Kiwi / Strawberries', 'Vitamin C supports immunity and multiplies non-heme iron absorption when eaten in the same meal.');
    }
    if (ratio('vitaminD') < 0.7) {
      add('vitaminD', 'Salmon / Sardines / Fortified Milk', 'Few foods contain vitamin D; oily fish and fortified dairy are the most reliable dietary sources.', 'Fortified Oat Milk / UV-Exposed Mushrooms');
    }
    if (ratio('vitaminB12') < 0.7) {
      add('vitaminB12', 'Eggs / Salmon / Greek Yogurt', 'B12 is found almost only in animal foods and fortified products, and is essential for nerve function and red blood cells.', 'Nutritional Yeast / Fortified Soy Milk');
    }
    if (ratio('calcium') < 0.7) {
      add('calcium', 'Greek Yogurt / Kale / Firm Tofu', 'Calcium-rich foods protect bone density; calcium-set tofu and kale are strong dairy-free options.');
    }
    if (ratio('potassium') < 0.7) {
      add('potassium', 'Banana / Sweet Potato / Avocado', 'Potassium balances sodium to support healthy blood pressure and muscle contraction.');
    }
    if (ratio('magnesium') < 0.7) {
      add('magnesium', 'Pumpkin Seeds / Almonds', 'Among the densest magnesium sources, supporting sleep quality, muscle relaxation and energy metabolism.');
    }
    if (ratio('zinc') < 0.7) {
      add('zinc', 'Pumpkin Seeds / Lean Beef / Chickpeas', 'Zinc supports immune function and wound healing; pair plant sources with protein for better absorption.');
    }
    if (ratio('omega3') < 0.7) {
      add('omega3', 'Salmon / Chia Seeds / Walnuts', 'Omega-3 fatty acids support heart and brain health and help moderate inflammation.');
    }
    if (ratio('vitaminA') < 0.7) {
      add('vitaminA', 'Sweet Potato / Carrots', 'Beta-carotene converts to vitamin A for vision and immunity; eat with a little fat for absorption.');
    }

    if (recs.length === 0) {
      return [{
        food: 'Keep doing what you are doing',
        reason: 'Every tracked macro and micronutrient is within range for this day. Maintain variety across the week.',
        trigger: 'All targets met',
        priority: 'info',
      }];
    }
    const order = { high: 0, medium: 1 };
    return recs.sort((a, b) => order[a.priority] - order[b.priority]);
  }
}


/* =========================================================
 * 7. ScheduleOptimizer – supplement timing rules
 * ======================================================= */

class ScheduleOptimizer {
  /**
   * @param {Object<string, {recipe, nutrients}|null>} meals – keyed by slot id
   * @param {string[]} selected – supplement ids
   * @param {boolean} coffeeAtBreakfast
   */
  static build(meals, selected, coffeeAtBreakfast) {
    const plan = Object.fromEntries(MEAL_SLOTS.map((s) => [s.id, []]));
    const has = (id) => selected.includes(id);
    const n = (slotId, key) => meals[slotId]?.nutrients[key] ?? 0;

    // Rule 1: fat-soluble nutrients go with the highest-fat meal (Dinner on ties / empty days).
    const fatSlot = [...MEAL_SLOTS].reverse()
      .reduce((best, slot) => (n(slot.id, 'fat') > n(best, 'fat') ? slot.id : best), 'dinner');
    const fatGrams = fmt(n(fatSlot, 'fat'));
    selected.filter((id) => SUPPLEMENT_BY_ID[id].fatSoluble).forEach((id) => {
      plan[fatSlot].push({
        id,
        reason: `Fat-soluble: taken with your highest-fat meal (${fatGrams} g fat) so it is absorbed with dietary fat.`,
      });
    });

    // Rule 2: iron goes with the most vitamin C, away from coffee and calcium.
    let ironSlot = null;
    if (has('iron')) {
      const candidates = MEAL_SLOTS.filter((s) => !(coffeeAtBreakfast && s.id === 'breakfast'));
      ironSlot = candidates.reduce((best, slot) => {
        const score = (id) => n(id, 'vitaminC') - n(id, 'calcium') / 10;
        return score(slot.id) > score(best.id) ? slot : best;
      }, candidates.find((s) => s.id === 'lunch')).id;
      const coffeeNote = coffeeAtBreakfast ? ' Kept away from breakfast coffee, whose polyphenols block absorption.' : '';
      plan[ironSlot].push({
        id: 'iron',
        reason: `Paired with ${fmt(n(ironSlot, 'vitaminC'))} mg vitamin C and only ${fmt(n(ironSlot, 'calcium'))} mg calcium in this meal; vitamin C boosts non-heme iron uptake.${coffeeNote}`,
      });
    }

    // Rule 3: vitamin C rides along with iron when both are taken.
    if (has('vitaminC')) {
      const slot = ironSlot ?? 'breakfast';
      plan[slot].push({
        id: 'vitaminC',
        reason: ironSlot ? 'Taken alongside iron to maximize iron absorption.' : 'Water-soluble; morning dosing with food is easy on the stomach.',
      });
    }

    // Rule 4: calcium is separated from iron.
    let calciumSlot = null;
    if (has('calcium')) {
      calciumSlot = ['lunch', 'breakfast', 'dinner'].find((id) => id !== ironSlot);
      plan[calciumSlot].push({
        id: 'calcium',
        reason: ironSlot
          ? `Separated from iron (${SLOT_BY_ID[ironSlot].label}) because calcium competes for the same absorption pathway.`
          : 'Split from your largest meals to improve absorption of smaller calcium doses.',
      });
    }

    // Rule 5: magnesium in the evening for sleep and recovery.
    if (has('magnesium')) {
      plan.dinner.push({ id: 'magnesium', reason: 'Evening dose supports muscle recovery and relaxation before sleep.' });
    }

    // Rule 6: zinc away from both iron and calcium.
    if (has('zinc')) {
      const slot = ['lunch', 'dinner', 'breakfast'].find((id) => id !== ironSlot && id !== calciumSlot) ?? 'dinner';
      plan[slot].push({ id: 'zinc', reason: 'Kept apart from iron and calcium, which compete with zinc for absorption; taken with food to avoid nausea.' });
    }

    // Rule 7: B12 in the morning.
    if (has('vitaminB12')) {
      plan.breakfast.push({ id: 'vitaminB12', reason: 'Water-soluble and involved in energy metabolism, so it fits best in the morning.' });
    }

    return plan;
  }

  /** Food-based synergy tips for a single meal. */
  static mealTips(slotId, meal, coffeeAtBreakfast) {
    if (!meal) return [];
    const tips = [];
    const { iron, vitaminC, fat, vitaminA } = meal.nutrients;
    if (iron >= 3 && vitaminC < 25) tips.push('Iron-rich meal: add bell pepper, citrus or strawberries to boost absorption.');
    if (slotId === 'breakfast' && coffeeAtBreakfast && iron >= 3) tips.push('Wait about an hour after this meal before drinking coffee.');
    if (vitaminA >= 300 && fat < 5) tips.push('Add a little olive oil or avocado to absorb the vitamin A in this meal.');
    return tips;
  }
}

/* =========================================================
 * 8. GroceryAggregator
 * ======================================================= */

class GroceryAggregator {
  /**
   * @param {(recipe) => {isSafe: boolean, ingredients: Array}} analyze – restriction-aware analyzer;
   *   unsafe recipes are skipped and substituted ingredients are bought instead of the originals.
   */
  static aggregate(plan, recipesById, household, supplementIds, analyze) {
    const items = new Map();

    DAYS.forEach((day) => MEAL_SLOTS.forEach((slot) => plan[day][slot.id].forEach(({ recipeId }) => {
      const recipe = recipesById.get(recipeId);
      if (!recipe) return;
      const analysis = analyze(recipe);
      if (!analysis.isSafe) return;
      const factor = household / Math.max(1, recipe.servings);
      analysis.ingredients.forEach((ing) => {
        if (ing.omitted) return;
        if (ing.foodId) {
          const food = FOOD_DB[ing.foodId];
          const entry = items.get(food.id) ?? { key: food.id, name: food.name, aisle: food.aisle, grams: 0, food, replaces: new Set() };
          entry.grams += ing.grams * factor;
          if (ing.swappedFrom) entry.replaces.add(ing.swappedFrom.toLowerCase());
          items.set(food.id, entry);
        } else {
          const key = `x:${ing.name.toLowerCase().replace(/[^a-z]+/g, '-')}:${ing.unit ?? 'unit'}`;
          const entry = items.get(key) ?? { key, name: ing.name, aisle: PANTRY, qty: 0, unit: ing.unit };
          entry.qty += ing.qty * factor;
          items.set(key, entry);
        }
      });
    })));

    supplementIds.forEach((id) => {
      items.set(`s:${id}`, { key: `s:${id}`, name: SUPPLEMENT_BY_ID[id].label, aisle: SPICES, note: 'check supply' });
    });

    return AISLES.map((aisle) => ({
      aisle,
      items: [...items.values()]
        .filter((item) => item.aisle === aisle)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((item) => ({ ...item, amount: this.formatAmount(item) })),
    })).filter((group) => group.items.length > 0);
  }

  static formatAmount(item) {
    if (item.note) return item.note;
    if (item.grams === undefined) {
      const qty = Math.round(item.qty * 100) / 100;
      return item.unit && item.unit !== 'unit' ? `${qty} ${item.unit}` : `${qty}×`;
    }
    const grams = item.grams > 50 ? Math.round(item.grams / 5) * 5 : Math.max(1, Math.round(item.grams));
    const weight = grams >= 1000 ? `${fmt(grams / 1000)} kg` : `${grams} g`;
    if (item.food.count) {
      const size = item.food.count === 'cans' ? item.food.gPerCan : item.food.gPerUnit;
      return `${Math.ceil(item.grams / size - 0.15)} ${item.food.count} (${weight})`;
    }
    return weight;
  }
}

/* =========================================================
 * 9. AuthManager – local, per-device accounts
 *
 * Credentials never leave the device: each password is salted and stretched
 * with PBKDF2-SHA-256 (Web Crypto) and only the hash is stored. This separates
 * people who share a browser; it is not server-grade security, because anyone
 * with access to the browser's storage can read the (unencrypted) meal data.
 * ======================================================= */

class AuthManager {
  static ITERATIONS = 210000; // OWASP 2023 recommendation for PBKDF2-HMAC-SHA256

  static normalize(email) {
    return email.trim().toLowerCase();
  }

  static registry() {
    return Storage.load(Storage.KEYS.accounts, {});
  }

  static account(email) {
    return this.registry()[email] ?? null;
  }

  static toBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  }

  static fromBase64(text) {
    return Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));
  }

  static async derive(password, salt, iterations) {
    if (!window.crypto?.subtle) throw new Error('unsupported');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return this.toBase64(bits);
  }

  /** @throws {Error} 'exists' | 'unsupported' */
  static async register(fullName, rawEmail, password) {
    const email = this.normalize(rawEmail);
    const accounts = this.registry();
    if (accounts[email]) throw new Error('exists');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    accounts[email] = {
      fullName: fullName.trim(),
      salt: this.toBase64(salt),
      hash: await this.derive(password, salt, this.ITERATIONS),
      iterations: this.ITERATIONS,
      createdAt: new Date().toISOString(),
    };
    Storage.save(Storage.KEYS.accounts, accounts);
    Storage.save(Storage.KEYS.session, email);
    return email;
  }

  /** @throws {Error} 'invalid' | 'unsupported' (one message for unknown email or wrong password) */
  static async signIn(rawEmail, password) {
    const email = this.normalize(rawEmail);
    const existing = this.account(email);
    if (!existing) throw new Error('invalid');
    const hash = await this.derive(password, this.fromBase64(existing.salt), existing.iterations);
    if (hash !== existing.hash) throw new Error('invalid');
    Storage.save(Storage.KEYS.session, email);
    return email;
  }

  static restoreSession() {
    const email = Storage.load(Storage.KEYS.session, null);
    return email && this.account(email) ? email : null;
  }

  static signOut() {
    Storage.remove(Storage.KEYS.session);
  }

  static deleteAccount(email) {
    const accounts = this.registry();
    delete accounts[email];
    Storage.save(Storage.KEYS.accounts, accounts);
    Storage.removeScope(email);
    this.signOut();
  }
}

/* =========================================================
 * 10. Application state & UI controllers
 * ======================================================= */

const state = {
  account: null,
  profile: { ...DEFAULT_PROFILE },
  recipes: [],
  plan: {},
  supplements: DEFAULT_SUPPLEMENTS,
  grocery: DEFAULT_GROCERY,
  ui: DEFAULT_UI,
  viewDay: todayKey(),
};

/** Reads the signed-in account's data, falling back to defaults and the sample library. */
const loadUserData = () => ({
  profile: { ...DEFAULT_PROFILE, ...Storage.load(Storage.KEYS.profile, {}) },
  recipes: Storage.load(Storage.KEYS.recipes, SEED_RECIPES),
  plan: normalizePlan(Storage.load(Storage.KEYS.plan, SEED_PLAN)),
  supplements: Storage.load(Storage.KEYS.supplements, DEFAULT_SUPPLEMENTS),
  grocery: Storage.load(Storage.KEYS.grocery, DEFAULT_GROCERY),
  ui: Storage.load(Storage.KEYS.ui, DEFAULT_UI),
});

const recipesById = () => new Map(state.recipes.map((r) => [r.id, r]));
const currentTargets = () => NutritionEngine.calculate(state.profile);
const analyzeForUser = (recipe) => SubstitutionEngine.screen(recipe, state.profile);
const firstName = () => state.account.fullName.split(/\s+/)[0];
const round1 = (n) => Math.round(n * 10) / 10;
const KG_PER_LB = 0.45359237;

/**
 * Each slot's dishes for a day with per-serving nutrients. Dishes that cannot be
 * made safe are marked `blocked` and contribute nothing; `nutrients` sums the rest.
 */
const mealsForDay = (day) => {
  const byId = recipesById();
  return Object.fromEntries(MEAL_SLOTS.map((slot) => {
    const items = state.plan[day][slot.id].map((entry, index) => {
      const recipe = byId.get(entry.recipeId);
      if (!recipe) return null;
      const analysis = analyzeForUser(recipe);
      return {
        recipe,
        index,
        kind: entry.kind,
        blocked: !analysis.isSafe,
        flagged: analysis.flagged,
        nutrients: analysis.isSafe ? analysis.perServing : emptyNutrients(),
      };
    }).filter(Boolean);
    if (!items.length) return [slot.id, null];
    const safe = items.filter((item) => !item.blocked);
    return [slot.id, {
      items,
      hasSafe: safe.length > 0,
      nutrients: safe.reduce((sum, item) => addNutrients(sum, item.nutrients), emptyNutrients()),
    }];
  }));
};

/** Restriction ids that have no safe substitute in a screened recipe. */
const blockedHits = (flagged) => [...new Set(flagged.filter((f) => !f.substitute).flatMap((f) => f.hits))];

/* ---------- Accessible tabs (WAI-ARIA tabs pattern, automatic activation) ---------- */

class Tabs {
  constructor(tablist, { onChange } = {}) {
    this.tabs = [...tablist.querySelectorAll('[role="tab"]')];
    this.onChange = onChange;
    tablist.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) this.select(tab.id);
    });
    tablist.addEventListener('keydown', (e) => {
      const index = this.tabs.indexOf(document.activeElement);
      const targets = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: this.tabs.length - 1 };
      if (index < 0 || !(e.key in targets)) return;
      e.preventDefault();
      const next = this.tabs[(targets[e.key] + this.tabs.length) % this.tabs.length];
      this.select(next.id, { focus: true });
    });
  }

  select(id, { focus = false } = {}) {
    const known = this.tabs.some((tab) => tab.id === id) ? id : this.tabs[0].id;
    this.tabs.forEach((tab) => {
      const selected = tab.id === known;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      if (selected && focus) tab.focus();
    });
    this.onChange?.(known);
  }
}

/** Sets or clears an inline field error wired through aria-describedby. */
const setFieldError = (input, message) => {
  input.setAttribute('aria-invalid', String(Boolean(message)));
  document.getElementById(`${input.id}-error`).textContent = message;
};

/* ---------- Auth view ---------- */

const AuthView = {
  tabs: null,

  init() {
    this.tabs = new Tabs($('#auth-tablist'));
    $('#signin-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.signIn();
    });
    $('#signup-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.signUp();
    });
    document.querySelectorAll('[data-password-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.getAttribute('aria-controls'));
        const show = button.getAttribute('aria-pressed') !== 'true';
        input.type = show ? 'text' : 'password';
        button.setAttribute('aria-pressed', String(show));
      });
    });
  },

  reset() {
    ['#signin-form', '#signup-form'].forEach((sel) => {
      const form = $(sel);
      form.reset();
      form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
      form.querySelectorAll('.field-error, .form-error').forEach((el) => { el.textContent = ''; });
      form.querySelectorAll('[data-password-toggle]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      form.querySelectorAll('input[type="text"][id$="password"]').forEach((i) => { i.type = 'password'; });
    });
    this.tabs.select('tab-signin');
  },

  /** Validates fields; returns the first invalid input or null. */
  validate(checks) {
    let first = null;
    checks.forEach(([input, ok, message]) => {
      setFieldError(input, ok ? '' : message);
      if (!ok && !first) first = input;
    });
    return first;
  },

  async withBusy(form, label, task) {
    const button = form.querySelector('[type="submit"]');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try {
      await task();
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  },

  async signIn() {
    const email = $('#signin-email');
    const password = $('#signin-password');
    $('#signin-error').textContent = '';
    const invalid = this.validate([
      [email, email.value.trim() !== '' && email.validity.valid, 'Enter an email address like you@example.com.'],
      [password, password.value !== '', 'Enter your password.'],
    ]);
    if (invalid) {
      invalid.focus();
      return;
    }
    await this.withBusy($('#signin-form'), 'Signing in…', async () => {
      try {
        App.enter(await AuthManager.signIn(email.value, password.value));
        announce(`Signed in. Welcome back, ${firstName()}.`);
      } catch (error) {
        $('#signin-error').textContent = error.message === 'invalid'
          ? 'That email and password combination was not found. Check both and try again.'
          : 'Accounts need a secure (https) connection and a modern browser.';
        password.select();
        password.focus();
      }
    });
  },

  async signUp() {
    const name = $('#signup-name');
    const email = $('#signup-email');
    const password = $('#signup-password');
    $('#signup-error').textContent = '';
    const invalid = this.validate([
      [name, name.value.trim().length >= 2, 'Enter your full name.'],
      [email, email.value.trim() !== '' && email.validity.valid, 'Enter an email address like you@example.com.'],
      [password, password.value.length >= 8, 'Use at least 8 characters.'],
    ]);
    if (invalid) {
      invalid.focus();
      return;
    }
    await this.withBusy($('#signup-form'), 'Creating account…', async () => {
      try {
        App.enter(await AuthManager.register(name.value, email.value, password.value));
        announce('Account created. Let’s set up your profile, step 1 of 4.');
      } catch (error) {
        if (error.message === 'exists') {
          setFieldError(email, 'An account with this email already exists. Choose “Sign in” instead.');
          email.focus();
        } else {
          $('#signup-error').textContent = 'Accounts need a secure (https) connection and a modern browser.';
        }
      }
    });
  },
};

/* ---------- Recipe importer (reused in onboarding and the recipe tab) ---------- */

class RecipeImporter {
  /**
   * @param {HTMLElement} root – container to render into
   * @param {{prefix: string, onSaved: (recipe, isUpdate: boolean) => void}} options
   */
  constructor(root, { prefix, onSaved }) {
    this.p = prefix;
    this.onSaved = onSaved;
    this.editingId = null;
    this.previewUrl = null;
    root.innerHTML = this.markup();
    this.bind();
  }

  el(name) {
    return document.getElementById(`${this.p}-${name}`);
  }

  markup() {
    const p = this.p;
    return `
      <div class="two-col">
        <article class="card" aria-labelledby="${p}-paste-title">
          <h3 id="${p}-paste-title">Paste recipe text</h3>
          <div class="field">
            <label for="${p}-raw">Raw recipe</label>
            <textarea id="${p}-raw" rows="8" aria-describedby="${p}-raw-hint" placeholder="Title: Morning Oats&#10;Servings: 2&#10;Ingredients:&#10;- 1 cup rolled oats&#10;- 2 cups milk&#10;Instructions:&#10;1. Simmer for 5 minutes."></textarea>
            <p id="${p}-raw-hint" class="field__hint">Include “Ingredients” and “Instructions” headings. Title and servings lines are optional.</p>
          </div>
          <button type="button" id="${p}-parse" class="btn btn--secondary">Parse into form</button>
        </article>
        <article class="card" aria-labelledby="${p}-ocr-title">
          <h3 id="${p}-ocr-title">Scan a recipe photo</h3>
          <div id="${p}-dropzone" class="dropzone" role="button" tabindex="0" aria-describedby="${p}-ocr-hint">
            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="32" height="32"><path d="M4 7h3l2-3h6l2 3h3v13H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>
            <span class="dropzone__title">Choose or drop a photo</span>
          </div>
          <p id="${p}-ocr-hint" class="field__hint">Simulated OCR for demonstration: your image never leaves this device, and a sample recipe text is extracted.</p>
          <input type="file" id="${p}-file" accept="image/*" hidden>
          <label for="${p}-progress" class="sr-only">Text extraction progress</label>
          <progress id="${p}-progress" class="ocr-progress" max="100" value="0" hidden></progress>
          <p id="${p}-status" class="ocr-status" role="status" aria-live="polite"></p>
          <img id="${p}-preview" class="ocr-preview" alt="" hidden>
        </article>
      </div>
      <form id="${p}-form" class="card form recipe-form" novalidate aria-labelledby="${p}-form-title">
        <h3 id="${p}-form-title">Recipe details</h3>
        <div class="form__grid form__grid--title">
          <div class="field">
            <label for="${p}-title">Title</label>
            <input type="text" id="${p}-title" autocomplete="off" required aria-describedby="${p}-title-error">
            <p id="${p}-title-error" class="field-error"></p>
          </div>
          <div class="field">
            <label for="${p}-servings">Servings</label>
            <input type="number" id="${p}-servings" min="1" max="50" step="1" value="1" inputmode="numeric" required aria-describedby="${p}-servings-error">
            <p id="${p}-servings-error" class="field-error"></p>
          </div>
          <div class="field">
            <label for="${p}-course">Course</label>
            <select id="${p}-course">
              ${Object.entries(COURSES).map(([id, c]) => `<option value="${id}" ${id === 'main' ? 'selected' : ''}>${c.label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="${p}-prep">Prep time <span class="field__hint">(min)</span></label>
            <input type="number" id="${p}-prep" min="0" max="600" step="1" inputmode="numeric" aria-describedby="${p}-prep-error">
            <p id="${p}-prep-error" class="field-error"></p>
          </div>
          <div class="field">
            <label for="${p}-cook">Cook time <span class="field__hint">(min)</span></label>
            <input type="number" id="${p}-cook" min="0" max="600" step="1" inputmode="numeric" aria-describedby="${p}-cook-hint ${p}-cook-error">
            <p id="${p}-cook-hint" class="field__hint">Use 0 for no cooking.</p>
            <p id="${p}-cook-error" class="field-error"></p>
          </div>
        </div>
        <div class="form__grid">
          <div class="field">
            <label for="${p}-ingredients">Ingredients <span class="field__hint">(one per line)</span></label>
            <textarea id="${p}-ingredients" rows="7" required aria-describedby="${p}-ingredients-hint ${p}-ingredients-error"></textarea>
            <p id="${p}-ingredients-hint" class="field__hint">Examples: “1 1/2 cups rolled oats”, “200 g spinach”, “2 large eggs”.</p>
            <p id="${p}-ingredients-error" class="field-error"></p>
          </div>
          <div class="field">
            <label for="${p}-instructions">Instructions <span class="field__hint">(optional)</span></label>
            <textarea id="${p}-instructions" rows="7"></textarea>
          </div>
        </div>
        <div class="button-row">
          <button type="button" id="${p}-analyze" class="btn btn--secondary">Analyze nutrition</button>
          <button type="submit" id="${p}-save" class="btn btn--primary">Save recipe</button>
          <button type="button" id="${p}-cancel" class="btn btn--ghost" hidden>Cancel edit</button>
        </div>
        <div id="${p}-analysis" class="analysis" aria-live="polite"></div>
      </form>`;
  }

  bind() {
    this.el('parse').addEventListener('click', () => this.parseRaw());
    this.el('analyze').addEventListener('click', () => this.renderAnalysis(this.readForm()));
    this.el('cancel').addEventListener('click', () => this.reset());
    this.el('form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.save();
    });

    // Custom drop zone: role="button" with Enter/Space keyboard activation.
    const zone = this.el('dropzone');
    const fileInput = this.el('file');
    zone.addEventListener('click', () => fileInput.click());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('is-dragging');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragging');
      this.handleImage(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => this.handleImage(fileInput.files[0]));
  }

  readForm() {
    return {
      id: this.editingId ?? createId(),
      title: this.el('title').value.trim(),
      servings: Number(this.el('servings').value),
      category: this.el('course').value,
      prepMinutes: this.el('prep').value === '' ? null : Number(this.el('prep').value),
      cookMinutes: this.el('cook').value === '' ? null : Number(this.el('cook').value),
      ingredientsText: this.el('ingredients').value.trim(),
      instructions: this.el('instructions').value.trim(),
    };
  }

  fillForm(recipe) {
    this.el('title').value = recipe.title;
    this.el('servings').value = recipe.servings;
    this.el('course').value = courseOf(recipe);
    this.el('prep').value = recipe.prepMinutes ?? '';
    this.el('cook').value = recipe.cookMinutes ?? '';
    this.el('ingredients').value = recipe.ingredientsText;
    this.el('instructions').value = recipe.instructions;
  }

  parseRaw() {
    const raw = this.el('raw');
    if (!raw.value.trim()) {
      announce('Paste recipe text first.');
      raw.focus();
      return;
    }
    const parsed = RecipeManager.parseRecipeText(raw.value);
    this.fillForm(parsed);
    this.renderAnalysis(this.readForm());
    const count = parsed.ingredientsText ? parsed.ingredientsText.split('\n').length : 0;
    announce(`Recipe parsed: “${parsed.title || 'Untitled'}” with ${count} ingredients. Review the details form.`);
    this.el('title').focus();
  }

  /** Simulated OCR: deterministic sample text chosen from the file size, revealed in progress steps. */
  handleImage(file) {
    const status = this.el('status');
    const progress = this.el('progress');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      status.textContent = 'That file is not an image. Choose a JPG, PNG, WebP or HEIC photo.';
      return;
    }
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = URL.createObjectURL(file);
    const preview = this.el('preview');
    preview.src = this.previewUrl;
    preview.alt = `Uploaded recipe photo: ${file.name}`;
    preview.hidden = false;

    const steps = [[20, 'Detecting text regions…'], [55, 'Recognizing characters…'], [85, 'Structuring recipe sections…'], [100, 'Done']];
    progress.hidden = false;
    steps.forEach(([value, label], i) => {
      window.setTimeout(() => {
        progress.value = value;
        status.textContent = `${label} ${value}%`;
        if (value === 100) {
          this.el('raw').value = OCR_SAMPLES[file.size % OCR_SAMPLES.length];
          progress.hidden = true;
          status.textContent = 'Text extracted (simulated). The details form has been pre-filled for review.';
          this.parseRaw();
        }
      }, (i + 1) * 400);
    });
  }

  renderAnalysis(recipe) {
    const out = this.el('analysis');
    if (!recipe.ingredientsText) {
      out.innerHTML = '<p>Add at least one ingredient to analyze.</p>';
      return;
    }
    const temp = { ...recipe, servings: recipe.servings || 1 };
    const { ingredients: parsed } = RecipeManager.analyze(temp);
    const { ingredients, perServing, unmatched, isSafe, flagged } = analyzeForUser(temp);
    const active = SubstitutionEngine.restrictionsFor(state.profile);
    const checkCell = (ing, i) => {
      const hits = SubstitutionEngine.detect(parsed[i]).filter((t) => active.includes(t));
      if (!hits.length) return active.length ? 'Safe' : '—';
      const flag = flagged.find((f) => f.raw === ing.raw);
      const badge = SubstitutionEngine.badge(hits, { isAllergy: flag.isAllergy, blocked: ing.blocked });
      if (ing.blocked) return `${badge} No safe substitute`;
      const sub = flag.substitute;
      return sub.name === 'Omit'
        ? `${badge} Omitted. ${escapeHTML(sub.note)}`
        : `${badge} Swapped for <strong>${escapeHTML(sub.name)}</strong> (${escapeHTML(sub.ratio)}). ${escapeHTML(sub.note)}`;
    };
    const rows = ingredients.map((ing, i) => `
      <tr>
        <td>${escapeHTML(ing.raw)}</td>
        <td>${ing.foodId ? escapeHTML(FOOD_DB[ing.foodId].name) : '<span class="badge badge--warn"><span aria-hidden="true">!</span> Not recognized</span>'}</td>
        <td>${ing.foodId ? `${fmt(ing.grams)} g` : '—'}</td>
        <td>${fmt(ing.nutrients.calories)}</td>
        <td>${checkCell(ing, i)}</td>
      </tr>`).join('');
    out.innerHTML = `
      <p class="analysis__summary">Per serving: <strong>${fmt(perServing.calories)} kcal</strong> ·
        ${fmt(perServing.protein)} g protein · ${fmt(perServing.carbs)} g carbs · ${fmt(perServing.fat)} g fat ·
        ${fmt(perServing.fiber)} g fiber · ${fmt(perServing.iron)} mg iron</p>
      ${!isSafe ? `<p class="analysis__danger">${SubstitutionEngine.badge(blockedHits(flagged), { blocked: true })} This recipe contains an allergen with no safe substitute. It will be left out of your meal plan and grocery list.</p>` : ''}
      ${isSafe && flagged.length ? `<p class="analysis__warn">Nutrition reflects ${flagged.length} swap${flagged.length === 1 ? '' : 's'} for your allergies and diet.</p>` : ''}
      ${unmatched ? `<p class="analysis__warn">${unmatched} ingredient${unmatched === 1 ? ' was' : 's were'} not found in the nutrition dictionary and ${unmatched === 1 ? 'is' : 'are'} excluded from totals.</p>` : ''}
      <div class="table-wrap">
        <table class="data-table">
          <caption>Ingredient matches for the whole recipe</caption>
          <thead><tr><th scope="col">Ingredient</th><th scope="col">Matched food</th><th scope="col">Weight</th><th scope="col">kcal</th><th scope="col">Allergy &amp; diet check</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  validate(recipe) {
    const checks = [
      [this.el('title'), recipe.title.length > 0, 'Enter a recipe title.'],
      [this.el('servings'), recipe.servings >= 1 && recipe.servings <= 50, 'Enter servings between 1 and 50.'],
      [this.el('ingredients'), recipe.ingredientsText.length > 0, 'Add at least one ingredient.'],
      [this.el('prep'), recipe.prepMinutes === null || (recipe.prepMinutes >= 0 && recipe.prepMinutes <= 600), 'Enter minutes between 0 and 600, or leave it blank.'],
      [this.el('cook'), recipe.cookMinutes === null || (recipe.cookMinutes >= 0 && recipe.cookMinutes <= 600), 'Enter minutes between 0 and 600, or leave it blank.'],
    ];
    let first = null;
    checks.forEach(([input, ok, message]) => {
      setFieldError(input, ok ? '' : message);
      if (!ok && !first) first = input;
    });
    return first;
  }

  save() {
    const recipe = this.readForm();
    const invalid = this.validate(recipe);
    if (invalid) {
      invalid.focus();
      announce('Please fix the highlighted recipe fields.');
      return;
    }
    const isUpdate = RecipeLibrary.upsert(recipe);
    this.reset();
    this.onSaved(recipe, isUpdate);
  }

  edit(recipe) {
    this.editingId = recipe.id;
    this.fillForm(recipe);
    this.renderAnalysis(recipe);
    this.el('cancel').hidden = false;
    this.el('save').textContent = 'Update recipe';
    this.el('title').focus();
    announce(`Editing “${recipe.title}”.`);
  }

  reset() {
    this.editingId = null;
    this.el('form').reset();
    this.el('raw').value = '';
    this.el('form').querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    this.el('form').querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
    this.el('cancel').hidden = true;
    this.el('save').textContent = 'Save recipe';
    this.el('analysis').innerHTML = '';
  }
}

/* ---------- Onboarding wizard ---------- */

const OnboardingWizard = {
  STEP_NAMES: ['Goals & activity', 'Diet & allergies', 'Body composition & biometrics', 'First recipe'],
  LENGTH_LIMITS: { metric: { min: 40, max: 200, label: '(cm)' }, imperial: { min: 16, max: 80, label: '(in)' } },
  MASS_LIMITS: { metric: { min: 20, max: 200, label: '(kg)' }, imperial: { min: 44, max: 440, label: '(lb)' } },
  mode: 'onboarding',
  step: 1,
  importer: null,

  init() {
    $('#goal-timeline').innerHTML = NutritionEngine.TIMELINES
      .map((w) => `<option value="${w}">${w} weeks (${NutritionEngine.pace(w).label.toLowerCase()} pace)</option>`).join('');
    $('#diet-options').innerHTML = Object.entries(DIETS).map(([id, diet]) => `
      <div class="choice">
        <input type="radio" id="diet-${id}" name="diet" value="${id}">
        <label for="diet-${id}"><span class="choice__title">${diet.label}</span> <span class="choice__desc">${diet.description}</span></label>
      </div>`).join('');
    $('#allergy-options').innerHTML = ALLERGY_IDS.map((id) => `
      <div class="check">
        <input type="checkbox" id="allergy-${id}" name="allergy" value="${id}">
        <label for="allergy-${id}">${RESTRICTIONS[id].option}</label>
      </div>`).join('');

    this.importer = new RecipeImporter($('#onboarding-importer'), {
      prefix: 'ob',
      onSaved: (recipe) => {
        this.renderAdded();
        announce(`Added “${recipe.title}” to your library.`);
      },
    });

    document.querySelectorAll('input[name="units"]').forEach((radio) => {
      radio.addEventListener('change', () => this.switchUnits(radio.value));
    });
    $('#wizard-back').addEventListener('click', () => this.showStep(this.step - 1));
    $('#wizard-next').addEventListener('click', () => this.next());
    $('#wizard-save').addEventListener('click', () => this.finish());
    $('#wizard-signout').addEventListener('click', () => App.signOut());
    $('#wizard-cancel').addEventListener('click', () => {
      App.showApp();
      announce('Edits discarded.');
    });
  },

  /** @param {'onboarding'|'edit'} mode */
  start(mode) {
    this.mode = mode;
    const editing = mode === 'edit';
    this.fill(state.profile);
    this.importer.reset();
    this.renderAdded();
    $('#wizard-title').innerHTML = editing ? 'Edit your <em>preferences</em>' : 'Let’s set <em>your table</em>';
    $('#wizard-intro').textContent = editing
      ? 'Update any step, then save. Targets, swaps and your grocery list refresh instantly.'
      : `Welcome, ${firstName()}. Four short steps and your personal targets, plan and grocery list are ready.`;
    $('#wizard-cancel').hidden = !editing;
    $('#wizard-signout').hidden = editing;
    $('#wizard-save').hidden = !editing;
    App.showView('onboarding', { focus: false });
    this.showStep(editing ? 1 : state.profile.onboardingStep);
  },

  showStep(n) {
    this.step = Math.min(4, Math.max(1, n));
    document.querySelectorAll('.wizard-step').forEach((section) => {
      section.hidden = Number(section.dataset.step) !== this.step;
    });
    const label = `Step ${this.step} of 4: ${this.STEP_NAMES[this.step - 1]}`;
    $('#wizard-progress-label').textContent = label;
    const bar = $('#wizard-progressbar');
    bar.setAttribute('aria-valuenow', String(this.step));
    bar.setAttribute('aria-valuetext', label);
    $('#wizard-progress-fill').style.width = `${(this.step / 4) * 100}%`;
    [...$('#wizard-steps').children].forEach((li, i) => {
      li.classList.toggle('is-done', i + 1 < this.step);
      if (i + 1 === this.step) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
    $('#wizard-back').disabled = this.step === 1;
    $('#wizard-next').textContent = this.step < 4 ? 'Continue' : (this.mode === 'edit' ? 'Save changes' : 'Finish setup');
    $(`#step-${this.step}-title`).focus();
  },

  next() {
    if (this.step === 4) {
      this.finish();
      return;
    }
    if (this.step === 3) {
      const invalid = this.validateBiometrics();
      if (invalid) {
        invalid.focus();
        announce('Please fix the highlighted fields.');
        return;
      }
    }
    if (this.mode === 'onboarding') {
      // Persist each completed step so a reload resumes where the user left off.
      state.profile = { ...state.profile, ...this.readStep(this.step), onboardingStep: this.step + 1 };
      Storage.save(Storage.KEYS.profile, state.profile);
    }
    this.showStep(this.step + 1);
  },

  finish() {
    const invalid = this.validateBiometrics();
    if (invalid) {
      this.showStep(3);
      invalid.focus();
      announce('Please complete your biometrics before saving.');
      return;
    }
    const wasOnboarding = this.mode === 'onboarding';
    state.profile = {
      ...state.profile,
      ...this.readStep(1),
      ...this.readStep(2),
      ...this.readStep(3),
      onboarded: true,
      onboardingStep: 4,
      updatedAt: new Date().toISOString(),
    };
    Storage.save(Storage.KEYS.profile, state.profile);
    App.showApp();
    const kcal = fmt(currentTargets().targets.calories);
    announce(wasOnboarding
      ? `Setup complete. Welcome to your dashboard, ${firstName()}: your target is ${kcal} calories a day.`
      : `Preferences saved. Your target is now ${kcal} calories a day; recipes and grocery list updated.`);
  },

  readStep(n) {
    if (n === 1) {
      return {
        goal: $('input[name="goal"]:checked').value,
        timelineWeeks: Number($('#goal-timeline').value),
        activity: $('#activity').value,
      };
    }
    if (n === 2) {
      return {
        diet: $('input[name="diet"]:checked').value,
        allergies: [...document.querySelectorAll('input[name="allergy"]:checked')].map((b) => b.value),
      };
    }
    if (n === 3) {
      const units = $('input[name="units"]:checked').value;
      const metric = units === 'metric';
      const optional = (sel, factor = 1) => ($(sel).value === '' ? null : round1(Number($(sel).value) * factor));
      return {
        units,
        age: Number($('#age').value),
        sex: $('#sex').value,
        heightCm: metric ? Number($('#height-cm').value) : (Number($('#height-ft').value) * 12 + Number($('#height-in').value)) * 2.54,
        weightKg: metric ? Number($('#weight-kg').value) : Number($('#weight-lb').value) * KG_PER_LB,
        bodyFatPct: optional('#body-fat'),
        waistCm: optional('#waist', metric ? 1 : 2.54),
        hipCm: optional('#hip', metric ? 1 : 2.54),
        leanMassKg: optional('#lean-mass', metric ? 1 : KG_PER_LB),
      };
    }
    return {};
  },

  fill(profile) {
    const metric = profile.units === 'metric';
    const value = (n) => (n === null || n === undefined ? '' : n);
    $(`#goal-${profile.goal}`).checked = true;
    $('#goal-timeline').value = String(profile.timelineWeeks);
    $('#activity').value = profile.activity;
    $(`#diet-${profile.diet}`).checked = true;
    document.querySelectorAll('input[name="allergy"]').forEach((box) => { box.checked = profile.allergies.includes(box.value); });
    $(`#units-${profile.units}`).checked = true;
    $('#age').value = value(profile.age);
    $('#sex').value = profile.sex;
    if (profile.heightCm) {
      const inches = profile.heightCm / 2.54;
      $('#height-cm').value = round1(profile.heightCm);
      $('#height-ft').value = Math.floor(inches / 12);
      $('#height-in').value = round1(inches % 12);
    } else {
      ['#height-cm', '#height-ft', '#height-in'].forEach((sel) => { $(sel).value = ''; });
    }
    $('#weight-kg').value = profile.weightKg ? round1(profile.weightKg) : '';
    $('#weight-lb').value = profile.weightKg ? round1(profile.weightKg / KG_PER_LB) : '';
    $('#body-fat').value = value(profile.bodyFatPct);
    $('#waist').value = profile.waistCm ? round1(metric ? profile.waistCm : profile.waistCm / 2.54) : '';
    $('#hip').value = profile.hipCm ? round1(metric ? profile.hipCm : profile.hipCm / 2.54) : '';
    $('#lean-mass').value = profile.leanMassKg ? round1(metric ? profile.leanMassKg : profile.leanMassKg / KG_PER_LB) : '';
    document.querySelectorAll('.wizard-step [aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    document.querySelectorAll('.wizard-step .field-error').forEach((el) => { el.textContent = ''; });
    this.applyUnitLimits(profile.units);
  },

  applyUnitLimits(units) {
    document.querySelectorAll('[data-units]').forEach((group) => { group.hidden = group.dataset.units !== units; });
    const length = this.LENGTH_LIMITS[units];
    const mass = this.MASS_LIMITS[units];
    document.querySelectorAll('[data-length]').forEach((input) => Object.assign(input, { min: length.min, max: length.max, step: 0.1 }));
    document.querySelectorAll('[data-mass]').forEach((input) => Object.assign(input, { min: mass.min, max: mass.max, step: 0.1 }));
    document.querySelectorAll('[data-length-unit]').forEach((el) => { el.textContent = length.label; });
    document.querySelectorAll('[data-mass-unit]').forEach((el) => { el.textContent = mass.label; });
  },

  /** Converts visible values when the unit system changes so no data is lost. */
  switchUnits(units) {
    const convert = (sel, factor) => {
      if (Number($(sel).value) > 0) $(sel).value = round1(Number($(sel).value) * factor);
    };
    if (units === 'metric') {
      const inches = Number($('#height-ft').value) * 12 + Number($('#height-in').value);
      if (inches > 0) $('#height-cm').value = round1(inches * 2.54);
      if (Number($('#weight-lb').value) > 0) $('#weight-kg').value = round1(Number($('#weight-lb').value) * KG_PER_LB);
      convert('#waist', 2.54);
      convert('#hip', 2.54);
      convert('#lean-mass', KG_PER_LB);
    } else {
      const cm = Number($('#height-cm').value);
      if (cm > 0) {
        $('#height-ft').value = Math.floor(cm / 2.54 / 12);
        $('#height-in').value = round1((cm / 2.54) % 12);
      }
      if (Number($('#weight-kg').value) > 0) $('#weight-lb').value = round1(Number($('#weight-kg').value) / KG_PER_LB);
      convert('#waist', 1 / 2.54);
      convert('#hip', 1 / 2.54);
      convert('#lean-mass', 1 / KG_PER_LB);
    }
    this.applyUnitLimits(units);
  },

  /** Validates visible step-3 numbers; optional fields may be blank. Returns first invalid input. */
  validateBiometrics() {
    const inputs = [...document.querySelectorAll('[data-step="3"] input[type="number"]')].filter((i) => !i.closest('[hidden]'));
    let first = null;
    inputs.forEach((input) => {
      const value = Number(input.value);
      const blankOptional = input.value === '' && !input.required;
      let message = '';
      if (!blankOptional && (input.value === '' || value < Number(input.min) || value > Number(input.max))) {
        message = `Enter a number between ${input.min} and ${input.max}${input.required ? '' : ', or leave it blank'}.`;
      }
      setFieldError(input, message);
      if (message && !first) first = input;
    });
    const lean = $('#lean-mass');
    const weight = $('#units-metric').checked ? $('#weight-kg') : $('#weight-lb');
    if (!first && lean.value !== '' && Number(lean.value) >= Number(weight.value)) {
      setFieldError(lean, 'Lean body mass must be less than your total weight.');
      first = lean;
    }
    return first;
  },

  renderAdded() {
    const custom = state.recipes.filter((r) => !r.id.startsWith('seed-'));
    $('#onboarding-added').innerHTML = custom.length
      ? `<h3>In your library</h3><ul class="added-list">${custom.map((r) => `<li>${escapeHTML(r.title)}</li>`).join('')}</ul>`
      : '';
  },
};

/* ---------- Recipe library ---------- */

const RecipeLibrary = {
  init() {
    $('#recipe-library').addEventListener('click', (e) => {
      const button = e.target.closest('button[data-action]');
      if (!button) return;
      const recipe = state.recipes.find((r) => r.id === button.dataset.id);
      if (button.dataset.action === 'edit') App.importer.edit(recipe);
      if (button.dataset.action === 'delete') this.remove(recipe);
    });
  },

  /** Inserts or replaces a recipe; returns true when it was an update. */
  upsert(recipe) {
    const index = state.recipes.findIndex((r) => r.id === recipe.id);
    if (index >= 0) state.recipes.splice(index, 1, recipe);
    else state.recipes.push(recipe);
    Storage.save(Storage.KEYS.recipes, state.recipes);
    return index >= 0;
  },

  remove(recipe) {
    if (!window.confirm(`Delete “${recipe.title}”? It will also be removed from your meal plan.`)) return;
    state.recipes = state.recipes.filter((r) => r.id !== recipe.id);
    DAYS.forEach((day) => MEAL_SLOTS.forEach((slot) => {
      state.plan[day][slot.id] = state.plan[day][slot.id].filter((dish) => dish.recipeId !== recipe.id);
    }));
    Storage.save(Storage.KEYS.recipes, state.recipes);
    Storage.save(Storage.KEYS.plan, state.plan);
    if (App.importer.editingId === recipe.id) App.importer.reset();
    App.renderAll();
    $('#library-heading').focus();
    announce(`Deleted “${recipe.title}”.`);
  },

  render() {
    $('#recipe-count').textContent = String(state.recipes.length);
    const list = $('#recipe-library');
    if (!state.recipes.length) {
      list.innerHTML = '<li class="empty">No recipes yet. Import one above to get started.</li>';
      return;
    }
    list.innerHTML = state.recipes.map((recipe) => {
      const { perServing: p, flagged, isSafe } = analyzeForUser(recipe);
      const title = escapeHTML(recipe.title);
      const checks = flagged.map((f) => {
        const badge = SubstitutionEngine.badge(f.hits, { isAllergy: f.isAllergy, blocked: !f.substitute });
        if (!f.substitute) return `<li>${badge} ${escapeHTML(f.original)}: no safe substitute; recipe unavailable</li>`;
        return `<li>${badge} ${escapeHTML(f.original)} → <strong>${escapeHTML(f.substitute.name === 'Omit' ? 'omitted' : f.substitute.name)}</strong></li>`;
      }).join('');
      return `
        <li>
          <article class="card recipe-card">
            <h3>${title}</h3>
            <p class="meta">${COURSES[courseOf(recipe)].label} · ${formatTimes(recipe)} · ${recipe.servings} serving${recipe.servings === 1 ? '' : 's'} · per serving${isSafe && flagged.length ? ', with your swaps' : ''}</p>
            <dl class="macro-chips">
              <div><dt>kcal</dt><dd>${fmt(p.calories)}</dd></div>
              <div><dt>Protein</dt><dd>${fmt(p.protein)} g</dd></div>
              <div><dt>Carbs</dt><dd>${fmt(p.carbs)} g</dd></div>
              <div><dt>Fat</dt><dd>${fmt(p.fat)} g</dd></div>
            </dl>
            ${checks ? `<ul class="allergy-list" aria-label="Allergy and diet check for ${title}">${checks}</ul>` : ''}
            <div class="button-row">
              <button type="button" class="btn btn--ghost" data-action="edit" data-id="${recipe.id}" aria-label="Edit ${title}">Edit</button>
              <button type="button" class="btn btn--ghost btn--danger" data-action="delete" data-id="${recipe.id}" aria-label="Delete ${title}">Delete</button>
            </div>
          </article>
        </li>`;
    }).join('');
  },
};

/* ---------- Dashboard & targets ---------- */

/* ---------- Day rail (native radios: arrow keys move between days) ---------- */

const DayRail = {
  /** Tabs whose content depends on the selected day. */
  TABS: ['tab-dashboard', 'tab-planner'],

  init() {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    $('#day-rail-list').innerHTML = DAYS.map((day, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const isToday = day === todayKey();
      const full = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      return `
        <input type="radio" id="day-${day}" name="view-day" value="${day}" class="day-rail__input">
        <label for="day-${day}" class="day-rail__day${isToday ? ' is-today' : ''}">
          <span class="day-rail__weekday" aria-hidden="true">${isToday ? 'Today' : DAY_LABELS[day].slice(0, 3)}</span>
          <span class="day-rail__date" aria-hidden="true">${date.getDate()}</span>
          <span class="day-rail__month" aria-hidden="true">${date.toLocaleDateString('en-US', { month: 'short' })}</span>
          <span class="sr-only">${full}${isToday ? ', today' : ''}</span>
        </label>`;
    }).join('');
    $('#day-rail-list').addEventListener('change', (e) => App.setViewDay(e.target.value));
  },

  sync() {
    $(`#day-${state.viewDay}`).checked = true;
  },

  /** Shows the rail only on tabs that use the selected day. */
  toggleFor(tabId) {
    const visible = this.TABS.includes(tabId);
    $('#day-rail').hidden = !visible;
    $('#app-body').classList.toggle('app-body--rail', visible);
  },
};

const DashboardUI = {
  status(meta, pct) {
    if (meta.isLimit) return pct <= 100 ? ['ok', 'Within limit'] : ['danger', 'Over limit'];
    if (meta.key === 'calories') {
      if (pct < 80) return ['warn', 'Under target'];
      return pct > 110 ? ['warn', 'Over target'] : ['ok', 'On target'];
    }
    if (meta.group === 'macro') {
      if (pct < 80) return ['warn', 'Low'];
      return pct > 125 && meta.key !== 'protein' ? ['warn', 'High'] : ['ok', 'On target'];
    }
    if (pct < 50) return ['danger', 'Deficient'];
    return pct < 80 ? ['warn', 'Low'] : ['ok', 'Met'];
  },

  row(meta, value, target, idPrefix = 'nutrient') {
    const pct = target > 0 ? Math.round((value / target) * 100) : 0;
    const width = Math.min(pct, 100);
    const [level, text] = this.status(meta, pct);
    const icon = { ok: '✓', warn: '!', danger: '✕' }[level];
    const labelId = `${idPrefix}-${meta.key}`;
    return `
      <li class="nutrient">
        <div class="nutrient__head">
          <span class="nutrient__label" id="${labelId}">${meta.label}</span>
          <span class="nutrient__value">${fmt(value)} / ${fmt(target)} ${meta.unit}</span>
          <span class="badge badge--${level}"><span aria-hidden="true">${icon}</span><span class="sr-only">Status:</span> ${text}</span>
        </div>
        <div class="bar" role="progressbar" aria-labelledby="${labelId}" aria-valuemin="0" aria-valuemax="100"
             aria-valuenow="${width}" aria-valuetext="${fmt(value)} of ${fmt(target)} ${meta.unit}, ${pct}% of ${meta.isLimit ? 'limit' : 'target'}">
          <span class="bar__fill bar__fill--${level}" style="width:${width}%"></span>
        </div>
      </li>`;
  },

  render() {
    const meals = mealsForDay(state.viewDay);
    const planned = Object.values(meals).filter((meal) => meal?.hasSafe);
    const intake = planned.reduce((sum, m) => addNutrients(sum, m.nutrients), emptyNutrients());
    const dishes = planned.reduce((count, m) => count + m.items.filter((item) => !item.blocked).length, 0);
    const { targets } = currentTargets();
    const lowCount = NUTRIENTS.filter((m) => m.group === 'micro' && intake[m.key] < targets[m.key] * 0.8).length;

    $('#dashboard-summary').textContent =
      `${DAY_LABELS[state.viewDay]}: ${planned.length} of ${MEAL_SLOTS.length} meals planned (${dishes} dish${dishes === 1 ? '' : 'es'}), ${fmt(intake.calories)} kcal. ` +
      `${lowCount} micronutrient${lowCount === 1 ? '' : 's'} below 80% of target.`;
    $('#macro-list').innerHTML = NUTRIENTS.filter((m) => m.group === 'macro').map((m) => this.row(m, intake[m.key], targets[m.key])).join('');
    $('#micro-list').innerHTML = NUTRIENTS.filter((m) => m.group === 'micro').map((m) => this.row(m, intake[m.key], targets[m.key])).join('');
    document.querySelectorAll('[data-day-label]').forEach((el) => { el.textContent = DAY_LABELS[state.viewDay]; });
    $('#dashboard-day').textContent = state.viewDay === todayKey() ? 'Today’s' : `${DAY_LABELS[state.viewDay]}’s`;
    return { intake, targets, plannedCount: planned.length, meals };
  },
};

const TargetsUI = {
  render() {
    const { bmr, tdee, pace, projectedKg, targets } = currentTargets();
    const { profile } = state;
    const metric = profile.units === 'metric';
    const mass = (kg) => (metric ? `${fmt(Math.abs(kg))} kg` : `${fmt(Math.abs(kg) / KG_PER_LB)} lb`);
    const goal = NutritionEngine.GOALS[profile.goal].label;
    const projection = profile.goal === 'maintain'
      ? 'Maintenance: calories match your daily energy expenditure.'
      : `${goal} over ${profile.timelineWeeks} weeks (${pace.toLowerCase()} pace): about ${mass(projectedKg)} ${projectedKg < 0 ? 'lost' : 'gained'} if followed consistently.`;
    const ketoNote = profile.diet === 'keto' ? '<p class="field__hint">Keto: carbohydrates capped at 30 g, with fat filling the remaining energy.</p>' : '';
    const rows = NUTRIENTS.map((meta) => `
      <tr><th scope="row">${meta.label}${meta.isLimit ? ' (max)' : ''}</th><td>${fmt(targets[meta.key])} ${meta.unit}</td></tr>`).join('');

    $('#targets-output').innerHTML = `
      <article class="card stack" aria-labelledby="energy-title">
        <h3 id="energy-title">Energy &amp; body composition</h3>
        <div class="stat-row">
          <p class="stat"><span class="stat__value">${fmt(targets.calories)}</span><span class="stat__label">Daily calories</span></p>
          <p class="stat"><span class="stat__value">${fmt(bmr)}</span><span class="stat__label">BMR (kcal)</span></p>
          <p class="stat"><span class="stat__value">${fmt(tdee)}</span><span class="stat__label">TDEE (kcal)</span></p>
        </div>
        <p>${projection}</p>
        ${ketoNote}
        ${this.bodyTable()}
      </article>
      <article class="card" aria-labelledby="targets-table-title">
        <h3 id="targets-table-title">Daily targets</h3>
        <div class="table-wrap">
          <table class="data-table">
            <caption class="sr-only">Daily nutrition targets</caption>
            <thead><tr><th scope="col">Nutrient</th><th scope="col">Daily target</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </article>`;
  },

  /** BMI, waist ratios and lean mass rows shared by the dashboard and the profile drawer. */
  bodyRows() {
    const c = NutritionEngine.bodyComposition(state.profile);
    const metric = state.profile.units === 'metric';
    const rows = [['BMI', fmt(c.bmi), c.bmiCategory]];
    rows.push(c.waistToHip
      ? ['Waist-to-hip ratio', c.waistToHip.toFixed(2), `${c.waistToHipRisk} (WHO cut-off ${c.waistToHipLimit})`]
      : ['Waist-to-hip ratio', '—', 'Add waist and hip measurements']);
    if (c.waistToHeight) rows.push(['Waist-to-height ratio', c.waistToHeight.toFixed(2), `${c.waistToHeightRisk} (cut-off 0.5)`]);
    if (c.leanMassKg) {
      rows.push(['Lean body mass', metric ? `${fmt(c.leanMassKg)} kg` : `${fmt(c.leanMassKg / KG_PER_LB)} lb`, c.leanSource]);
      rows.push(['BMR (Katch-McArdle)', `${fmt(c.katchBmr)} kcal`, 'Lean-mass estimate, for comparison']);
    }
    return rows;
  },

  bodyTable() {
    return `
      <div class="table-wrap">
        <table class="data-table">
          <caption>Body composition</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col">Value</th><th scope="col">Interpretation</th></tr></thead>
          <tbody>${this.bodyRows().map(([label, value, note]) => `<tr><th scope="row">${label}</th><td>${value}</td><td>${note}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
  },
};

const RecommendationsUI = {
  render({ intake, targets, plannedCount }) {
    const recs = RecommendationEngine.recommend(intake, targets, plannedCount, SubstitutionEngine.restrictionsFor(state.profile));
    const label = { high: 'Biggest gap', medium: 'Suggested', info: 'Note' };
    const level = { high: 'danger', medium: 'warn', info: 'ok' };
    $('#recommendation-list').innerHTML = recs.map((rec) => `
      <li>
        <article class="card rec rec--${rec.priority}">
          <p><span class="badge badge--${level[rec.priority]}">${label[rec.priority]}</span></p>
          <h3 class="rec__food">${escapeHTML(rec.food)}</h3>
          <p class="meta"><strong>Why now:</strong> ${escapeHTML(rec.trigger)}</p>
          <p>${escapeHTML(rec.reason)}</p>
          ${rec.restrictionNote ? `<p class="meta">${escapeHTML(rec.restrictionNote)}</p>` : ''}
        </article>
      </li>`).join('');
  },
};

/* ---------- Planner & schedule ---------- */

/**
 * Day planner with a collapsible recipe shelf. Mouse users drag recipes (or stacked
 * dishes) into Breakfast, Lunch or Dinner; keyboard and touch users select a recipe
 * with Enter, Space or a tap and choose "Add here", and move dishes with "Move to".
 * Each slot stacks any number of dishes, and the day's totals update live.
 */
const PlannerUI = {
  picked: null,
  filter: { query: '', course: 'all' },
  DRAG_TYPE: 'application/x-ubecafe-dish',

  init() {
    $('#palette-courses').innerHTML = [['all', 'All'], ...Object.entries(COURSES).map(([id, c]) => [id, c.plural])].map(([id, label]) => `
      <input type="radio" id="course-${id}" name="palette-course" value="${id}" ${id === 'all' ? 'checked' : ''}>
      <label for="course-${id}">${label}</label>`).join('');
    $('#palette-search').addEventListener('input', (e) => {
      this.filter.query = e.target.value.trim().toLowerCase();
      this.renderPalette();
    });
    $('#palette-courses').addEventListener('change', (e) => {
      this.filter.course = e.target.value;
      this.renderPalette();
    });
    $('#palette-toggle').addEventListener('click', () => {
      state.ui = { ...state.ui, shelfOpen: !this.shelfOpen() };
      Storage.save(Storage.KEYS.ui, state.ui);
      this.syncShelf();
    });

    const palette = $('#palette-list');
    const togglePick = (item) => {
      if (item.getAttribute('aria-disabled') === 'true') return;
      this.pick(this.picked === item.dataset.recipe ? null : item.dataset.recipe);
      document.querySelector(`[data-recipe="${item.dataset.recipe}"]`)?.focus();
    };
    palette.addEventListener('click', (e) => {
      const item = e.target.closest('[data-recipe]');
      if (item) togglePick(item);
    });
    // Custom role="button": Enter and Space activate, like a native button.
    palette.addEventListener('keydown', (e) => {
      const item = e.target.closest('[data-recipe]');
      if (!item || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      togglePick(item);
    });
    palette.addEventListener('dragstart', (e) => {
      const item = e.target.closest('[data-recipe]');
      if (!item) return;
      e.dataTransfer.setData(this.DRAG_TYPE, JSON.stringify({ recipeId: item.dataset.recipe }));
      e.dataTransfer.effectAllowed = 'copy';
    });

    const slots = $('#planner-slots');
    slots.addEventListener('dragstart', (e) => {
      const dish = e.target.closest('[data-dish]');
      if (!dish) return;
      e.dataTransfer.setData(this.DRAG_TYPE, JSON.stringify({ from: { slot: dish.dataset.slot, index: Number(dish.dataset.index) } }));
      e.dataTransfer.effectAllowed = 'move';
    });
    slots.addEventListener('dragover', (e) => {
      const zone = e.target.closest('[data-dropzone]');
      if (!zone || !e.dataTransfer.types.includes(this.DRAG_TYPE)) return;
      e.preventDefault();
      zone.classList.add('is-over');
    });
    slots.addEventListener('dragleave', (e) => {
      const zone = e.target.closest('[data-dropzone]');
      if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
    });
    slots.addEventListener('drop', (e) => {
      const zone = e.target.closest('[data-dropzone]');
      if (!zone) return;
      e.preventDefault();
      zone.classList.remove('is-over');
      const data = JSON.parse(e.dataTransfer.getData(this.DRAG_TYPE) || 'null');
      if (data?.from) this.move(data.from, zone.dataset.dropzone);
      else if (data?.recipeId) this.add(data.recipeId, zone.dataset.dropzone);
    });
    slots.addEventListener('click', (e) => {
      const addButton = e.target.closest('[data-add-slot]');
      const removeButton = e.target.closest('[data-remove]');
      if (addButton) this.addPicked(addButton.dataset.addSlot);
      if (removeButton) this.remove(removeButton.dataset.slot, Number(removeButton.dataset.index));
    });
    slots.addEventListener('change', (e) => {
      if (!e.target.matches('[data-move]') || e.target.value === e.target.dataset.slot) return;
      this.move({ slot: e.target.dataset.slot, index: Number(e.target.dataset.index) }, e.target.value, { focus: true });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.picked) {
        const id = this.picked;
        this.pick(null);
        document.querySelector(`[data-recipe="${id}"]`)?.focus();
        announce('Selection cancelled.');
      }
    });
    $('#clear-day').addEventListener('click', () => {
      MEAL_SLOTS.forEach((slot) => { state.plan[state.viewDay][slot.id] = []; });
      this.commit();
      announce(`${DAY_LABELS[state.viewDay]} cleared.`);
    });
    $('#clear-week').addEventListener('click', () => {
      if (!window.confirm('Clear every meal from this week?')) return;
      DAYS.forEach((day) => MEAL_SLOTS.forEach((slot) => { state.plan[day][slot.id] = []; }));
      this.commit();
      announce('Weekly plan cleared.');
    });
  },

  shelfOpen() {
    return state.ui.shelfOpen !== false;
  },

  syncShelf() {
    const open = this.shelfOpen();
    $('#palette-toggle').setAttribute('aria-expanded', String(open));
    $('#palette-toggle-label').textContent = open ? 'Hide' : 'Show';
    $('#palette-body').hidden = !open;
    $('#planner-layout').classList.toggle('is-shelf-collapsed', !open);
  },

  dishes(slotId) {
    return state.plan[state.viewDay][slotId];
  },

  dayLabel(slotId) {
    return `${DAY_LABELS[state.viewDay]} ${SLOT_BY_ID[slotId].label.toLowerCase()}`;
  },

  /** One-line running total for announcements after each change. */
  dayTotalText() {
    const meals = Object.values(mealsForDay(state.viewDay)).filter((m) => m?.hasSafe);
    const kcal = meals.reduce((sum, m) => sum + m.nutrients.calories, 0);
    return `Day total ${fmt(kcal)} of ${fmt(currentTargets().targets.calories)} kcal.`;
  },

  /** Saves the plan, refreshes every dependent view (totals included) and optionally restores focus. */
  commit(focusSelector) {
    Storage.save(Storage.KEYS.plan, state.plan);
    App.renderNutrition();
    GroceryUI.render();
    if (focusSelector) document.querySelector(focusSelector)?.focus();
  },

  pick(recipeId) {
    this.picked = recipeId;
    this.renderPalette();
    this.renderSlots();
    if (recipeId) {
      const recipe = state.recipes.find((r) => r.id === recipeId);
      announce(`Selected ${recipe.title}. Choose “Add here” on Breakfast, Lunch or Dinner, or press Escape to cancel.`);
    }
  },

  add(recipeId, slotId) {
    const recipe = state.recipes.find((r) => r.id === recipeId);
    if (!recipe || !analyzeForUser(recipe).isSafe) return;
    this.dishes(slotId).push({ recipeId, kind: courseOf(recipe) });
    this.picked = null;
    this.renderPalette();
    this.commit(`[data-add-slot="${slotId}"]`);
    const count = this.dishes(slotId).length;
    announce(`Added ${recipe.title} to ${this.dayLabel(slotId)}, ${count} dish${count === 1 ? '' : 'es'} there now. ${this.dayTotalText()}`);
  },

  addPicked(slotId) {
    if (this.picked) {
      this.add(this.picked, slotId);
      return;
    }
    if (!this.shelfOpen()) $('#palette-toggle').click();
    $('#palette-search').focus();
    announce('Select a recipe on the shelf first, then choose “Add here”.');
  },

  move(from, toSlot, { focus = false } = {}) {
    const [dish] = this.dishes(from.slot).splice(from.index, 1);
    if (!dish) return;
    this.dishes(toSlot).push(dish);
    this.commit(focus ? `[data-add-slot="${toSlot}"]` : undefined);
    const recipe = state.recipes.find((r) => r.id === dish.recipeId);
    announce(`Moved ${recipe?.title ?? 'dish'} to ${this.dayLabel(toSlot)}. ${this.dayTotalText()}`);
  },

  remove(slotId, index) {
    const [dish] = this.dishes(slotId).splice(index, 1);
    this.commit(`[data-add-slot="${slotId}"]`);
    const recipe = state.recipes.find((r) => r.id === dish.recipeId);
    announce(`Removed ${recipe?.title ?? 'dish'} from ${this.dayLabel(slotId)}. ${this.dayTotalText()}`);
  },

  /** Shelf only; slots and totals re-render with the day's nutrition (App.renderNutrition). */
  render() {
    this.syncShelf();
    this.renderPalette();
  },

  renderPalette() {
    const { query, course } = this.filter;
    const recipes = state.recipes.filter((r) => (course === 'all' || courseOf(r) === course)
      && (!query || r.title.toLowerCase().includes(query)));
    $('#palette-count').textContent = `${recipes.length} recipe${recipes.length === 1 ? '' : 's'}`;
    $('#palette-list').innerHTML = recipes.length ? recipes.map((recipe) => {
      const { isSafe, flagged, perServing } = analyzeForUser(recipe);
      const kind = courseOf(recipe);
      const picked = this.picked === recipe.id;
      const status = isSafe
        ? (flagged.length ? '<span class="palette-item__note">With allergy/diet swaps</span>' : '')
        : `<span class="palette-item__note">Unavailable: contains ${blockedHits(flagged).map((t) => RESTRICTIONS[t].label.toLowerCase()).join(', ')}</span>`;
      // A focusable role="button" rather than <button>: browsers won't start a native drag from a <button>.
      return `
        <li>
          <div role="button" tabindex="0" class="palette-item${picked ? ' is-picked' : ''}" data-recipe="${recipe.id}"
            draggable="${isSafe}" aria-pressed="${picked}" aria-disabled="${!isSafe}" aria-describedby="palette-hint">
            <span class="palette-item__icon palette-item__icon--${kind}">${courseIcon(kind)}</span>
            <span class="palette-item__body">
              <span class="palette-item__title">${escapeHTML(recipe.title)}</span>
              <span class="palette-item__meta">${courseBadge(kind)}</span>
              <span class="palette-item__meta">${formatTimes(recipe)}</span>
              <span class="palette-item__meta">${fmt(perServing.calories)} kcal · ${fmt(perServing.protein)} g protein</span>
              ${status}
            </span>
          </div>
        </li>`;
    }).join('') : '<li class="palette-empty">No recipes match. Try another search or course.</li>';
  },

  /** Live daily totals grouped by function, shown directly above the meal slots. */
  renderTotals(meals) {
    const planned = Object.values(meals).filter((m) => m?.hasSafe);
    const intake = planned.reduce((sum, m) => addNutrients(sum, m.nutrients), emptyNutrients());
    const { targets } = currentTargets();
    const row = (key) => DashboardUI.row(NUTRIENT_BY_KEY[key], intake[key], targets[key], 'total');
    const gaps = NUTRIENTS.filter((m) => m.group === 'micro' && m.key !== 'fiber')
      .map((m) => ({ m, pct: targets[m.key] ? Math.round((intake[m.key] / targets[m.key]) * 100) : 100 }))
      .filter(({ pct }) => pct < 80);
    const gapBadges = gaps.length
      ? gaps.map(({ m, pct }) => (pct < 50
        ? `<li><span class="badge badge--danger"><span aria-hidden="true">✕</span> ${m.label} deficit</span> <span class="meta">${pct}%</span></li>`
        : `<li><span class="badge badge--warn"><span aria-hidden="true">!</span> ${m.label} gap</span> <span class="meta">${pct}%</span></li>`)).join('')
      : '<li><span class="badge badge--ok"><span aria-hidden="true">✓</span> Micronutrient targets met</span></li>';
    const group = (id, title, body) => `
      <div class="totals-group">
        <p class="totals-group__title" id="totals-${id}">${title}</p>
        <ul class="nutrient-list" aria-labelledby="totals-${id}">${body}</ul>
      </div>`;
    $('#day-totals-body').innerHTML = `
      ${group('energy', 'Energy &amp; Muscle', row('calories') + row('protein'))}
      ${group('digestion', 'Digestion &amp; Quality', `${row('fiber')}${row('sugar')}`)}
      <div class="totals-group">
        <p class="totals-group__title" id="totals-macros">Macros &amp; Micros</p>
        <ul class="nutrient-list" aria-labelledby="totals-macros">${row('carbs')}</ul>
        <p class="meta" id="totals-gaps-label">Micronutrient gaps (below 80% of target):</p>
        <ul class="gap-list" aria-labelledby="totals-gaps-label">${gapBadges}</ul>
      </div>`;
    $('#day-totals-note').textContent = `${planned.length} of ${MEAL_SLOTS.length} meals planned, ${planned.reduce((n, m) => n + m.items.filter((i) => !i.blocked).length, 0)} dishes.`;
  },

  renderSlots() {
    const meals = mealsForDay(state.viewDay);
    this.renderTotals(meals);
    const pickedRecipe = this.picked && state.recipes.find((r) => r.id === this.picked);
    $('#planner-slots').classList.toggle('is-armed', Boolean(pickedRecipe));
    $('#planner-slots').innerHTML = MEAL_SLOTS.map((slot) => {
      const meal = meals[slot.id];
      const titleId = `slot-${slot.id}-title`;
      const dishes = meal ? meal.items.map((item) => {
        const title = escapeHTML(item.recipe.title);
        const moveId = `move-${slot.id}-${item.index}`;
        const n = item.nutrients;
        const summary = item.blocked
          ? `${SubstitutionEngine.badge(blockedHits(item.flagged), { blocked: true })} Unavailable, not counted`
          : `${fmt(n.calories)} kcal · P ${fmt(n.protein)} g · C ${fmt(n.carbs)} g · F ${fmt(n.fat)} g${item.flagged.length ? ' · with swaps' : ''}`;
        return `
          <li class="dish dish--${item.kind}${item.blocked ? ' is-blocked' : ''}" data-dish data-slot="${slot.id}" data-index="${item.index}" draggable="true">
            <span class="dish__grip" aria-hidden="true">⋮⋮</span>
            <span class="dish__body">
              <span class="dish__title">${title}</span>
              <span class="dish__badge">${courseBadge(item.kind)}</span>
              <span class="meta">${summary}</span>
            </span>
            <span class="dish__actions">
              <label class="sr-only" for="${moveId}">Move ${title} to</label>
              <select id="${moveId}" class="dish__move" data-move data-slot="${slot.id}" data-index="${item.index}">
                ${MEAL_SLOTS.map((s) => `<option value="${s.id}" ${s.id === slot.id ? 'selected' : ''}>${s.id === slot.id ? `In ${s.label.toLowerCase()}` : `Move to ${s.label.toLowerCase()}`}</option>`).join('')}
              </select>
              <button type="button" class="btn btn--ghost dish__remove" data-remove data-slot="${slot.id}" data-index="${item.index}" aria-label="Remove ${title} from ${this.dayLabel(slot.id)}">
                <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
            </span>
          </li>`;
      }).join('') : '<li class="slot__empty">Drop a recipe here</li>';
      return `
        <li class="slot" data-dropzone="${slot.id}">
          <div class="slot__header">
            <h3 id="${titleId}"><time datetime="${slot.time}">${slot.display}</time> ${slot.label}</h3>
            <span class="meta">${meal?.hasSafe ? `${fmt(meal.nutrients.calories)} kcal · ${fmt(meal.nutrients.protein)} g protein` : ''}</span>
          </div>
          <ul class="slot__dishes" aria-labelledby="${titleId}">${dishes}</ul>
          <button type="button" class="btn btn--ghost slot__add" data-add-slot="${slot.id}">
            ${pickedRecipe ? `Add “${escapeHTML(pickedRecipe.title)}” here` : '+ Add here'}<span class="sr-only"> to ${this.dayLabel(slot.id)}</span>
          </button>
        </li>`;
    }).join('');
  },
};

const ScheduleUI = {
  init() {
    $('#supplement-options').innerHTML = SUPPLEMENTS.map((s) => `
      <div class="check">
        <input type="checkbox" id="supp-${s.id}" name="supplements" value="${s.id}">
        <label for="supp-${s.id}">${s.label}</label>
      </div>`).join('');
    $('#supplement-form').addEventListener('change', () => {
      state.supplements = {
        selected: [...document.querySelectorAll('input[name="supplements"]:checked')].map((i) => i.value),
        coffeeAtBreakfast: $('#coffee-breakfast').checked,
      };
      Storage.save(Storage.KEYS.supplements, state.supplements);
      this.render(mealsForDay(state.viewDay));
      GroceryUI.render();
    });
  },

  syncForm() {
    document.querySelectorAll('input[name="supplements"]').forEach((box) => { box.checked = state.supplements.selected.includes(box.value); });
    $('#coffee-breakfast').checked = state.supplements.coffeeAtBreakfast;
  },

  render(meals) {
    const { selected, coffeeAtBreakfast } = state.supplements;
    const schedule = ScheduleOptimizer.build(meals, selected, coffeeAtBreakfast);
    $('#timeline').innerHTML = MEAL_SLOTS.map((slot) => {
      const meal = meals[slot.id];
      let mealText = '<p class="timeline__meal timeline__meal--empty">No meal planned</p>';
      if (meal) {
        const dishes = meal.items.map((item) => {
          const swaps = item.flagged.filter((f) => f.substitute)
            .map((f) => (f.substitute.name === 'Omit' ? `${f.original.toLowerCase()} omitted` : `${f.substitute.name} for ${f.original.toLowerCase()}`));
          const detail = item.blocked
            ? ` ${SubstitutionEngine.badge(blockedHits(item.flagged), { blocked: true })} excluded: no safe substitute`
            : `${swaps.length ? ` <span class="meta">(swaps: ${escapeHTML(swaps.join('; '))})</span>` : ''}`;
          return `<li><span class="meta">${COURSES[item.kind].label}:</span> ${escapeHTML(item.recipe.title)}${detail}</li>`;
        }).join('');
        mealText = `<ul class="timeline__dishes">${dishes}</ul>
          ${meal.hasSafe ? `<p class="meta">${fmt(meal.nutrients.calories)} kcal · ${fmt(meal.nutrients.protein)} g protein · ${fmt(meal.nutrients.fat)} g fat · ${fmt(meal.nutrients.vitaminC)} mg vitamin C</p>` : ''}`;
      }
      const tips = ScheduleOptimizer.mealTips(slot.id, meal?.hasSafe ? meal : null, coffeeAtBreakfast);
      const supps = schedule[slot.id].length
        ? `<ul class="supp-list">${schedule[slot.id].map((s) => `<li><strong>${SUPPLEMENT_BY_ID[s.id].label}</strong>: ${escapeHTML(s.reason)}</li>`).join('')}</ul>`
        : '';
      const tipList = tips.length ? `<ul class="tip-list">${tips.map((t) => `<li>${t}</li>`).join('')}</ul>` : '';
      return `
        <li class="timeline__item">
          <article class="card">
            <h3 class="timeline__heading"><time datetime="${slot.time}">${slot.display}</time> <span class="timeline__slot">${slot.label}</span></h3>
            ${mealText}${supps}${tipList}
          </article>
        </li>`;
    }).join('');
  },
};

/* ---------- Grocery list ---------- */

const GroceryUI = {
  init() {
    const household = $('#household-size');
    household.addEventListener('change', () => {
      const value = Math.min(12, Math.max(1, Math.round(Number(household.value) || 1)));
      household.value = value;
      state.grocery.household = value;
      Storage.save(Storage.KEYS.grocery, state.grocery);
      this.render();
      announce(`Grocery quantities updated for ${value} ${value === 1 ? 'person' : 'people'}.`);
    });
    $('#grocery-list').addEventListener('change', (e) => {
      const checked = new Set(state.grocery.checked);
      if (e.target.checked) checked.add(e.target.value);
      else checked.delete(e.target.value);
      state.grocery.checked = [...checked];
      Storage.save(Storage.KEYS.grocery, state.grocery);
      this.updateProgress();
    });
    $('#uncheck-all').addEventListener('click', () => {
      state.grocery.checked = [];
      Storage.save(Storage.KEYS.grocery, state.grocery);
      document.querySelectorAll('#grocery-list input[type="checkbox"]').forEach((box) => { box.checked = false; });
      this.updateProgress();
      announce('All grocery items unchecked.');
    });

    const now = new Date();
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    $('#shopping-day').textContent = now.getDay() === 0
      ? 'Today is Sunday: your list is ready to shop.'
      : `Next shopping day: ${sunday.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`;
  },

  syncForm() {
    $('#household-size').value = state.grocery.household;
  },

  render() {
    const groups = GroceryAggregator.aggregate(state.plan, recipesById(), state.grocery.household, state.supplements.selected, analyzeForUser);
    const checked = new Set(state.grocery.checked);
    const list = $('#grocery-list');
    if (!groups.length) {
      list.innerHTML = '<p class="empty">Your list is empty. Plan some meals for the week to generate it.</p>';
      this.updateProgress();
      return;
    }
    list.innerHTML = groups.map((group) => `
      <fieldset class="card aisle">
        <legend>${group.aisle} <span class="aisle__count">(${group.items.length})</span></legend>
        <ul>
          ${group.items.map((item) => {
            const id = `g-${item.key.replace(/[^a-z0-9-]/gi, '-')}`;
            const swap = item.replaces?.size ? ` <span class="grocery__swap">swap for ${escapeHTML([...item.replaces].join(', '))}</span>` : '';
            return `
              <li class="check check--grocery">
                <input type="checkbox" id="${id}" value="${escapeHTML(item.key)}" ${checked.has(item.key) ? 'checked' : ''}>
                <label for="${id}"><span class="grocery__name">${escapeHTML(item.name)}${swap}</span> <span class="grocery__qty">${escapeHTML(item.amount)}</span></label>
              </li>`;
          }).join('')}
        </ul>
      </fieldset>`).join('');
    this.updateProgress();
  },

  updateProgress() {
    const boxes = [...document.querySelectorAll('#grocery-list input[type="checkbox"]')];
    const done = boxes.filter((b) => b.checked).length;
    $('#grocery-progress').textContent = boxes.length ? `${done} of ${boxes.length} items in your basket.` : '';
  },
};

/* ---------- Profile drawer (native modal <dialog>: focus trap + Escape built in) ---------- */

const ProfileDrawer = {
  init() {
    const dialog = $('#profile-drawer');
    $('#profile-button').addEventListener('click', () => {
      this.render();
      dialog.showModal();
    });
    $('#drawer-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close(); // backdrop click
    });
    $('#drawer-edit').addEventListener('click', () => {
      dialog.close();
      OnboardingWizard.start('edit');
    });
    $('#drawer-signout').addEventListener('click', () => App.signOut());
    $('#drawer-delete').addEventListener('click', () => {
      const { email } = state.account;
      if (!window.confirm(`Permanently delete the account ${email} and all of its saved data on this device?`)) return;
      AuthManager.deleteAccount(email);
      App.signOut(`Account ${email} and its data were deleted.`);
    });
  },

  renderButton() {
    const { fullName } = state.account;
    const c = NutritionEngine.bodyComposition(state.profile);
    $('#profile-initials').textContent = fullName.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    $('#profile-button-name').textContent = firstName();
    $('#profile-button-stats').textContent = `BMI ${fmt(c.bmi)}${c.waistToHip ? ` · WHR ${c.waistToHip.toFixed(2)}` : ''}`;
  },

  render() {
    const { profile, account } = state;
    $('#drawer-name').textContent = account.fullName;
    $('#drawer-email').textContent = account.email;
    $('#drawer-body').innerHTML = TargetsUI.bodyRows()
      .map(([label, value, note]) => `<div><dt>${label}</dt><dd>${value} <span class="meta">${note}</span></dd></div>`).join('');
    const allergies = profile.allergies.map((a) => RESTRICTIONS[a].label).join(', ') || 'None';
    const prefs = [
      ['Goal', `${NutritionEngine.GOALS[profile.goal].label}${profile.goal === 'maintain' ? '' : `, ${profile.timelineWeeks} weeks`}`],
      ['Diet', DIETS[profile.diet].label],
      ['Allergies', allergies],
      ['Daily target', `${fmt(currentTargets().targets.calories)} kcal`],
    ];
    $('#drawer-prefs').innerHTML = prefs.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHTML(value)}</dd></div>`).join('');
  },
};

/* ---------- Theme ---------- */

const ThemeUI = {
  init() {
    const button = $('#theme-toggle');
    const stored = Storage.load(Storage.KEYS.theme, null);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    if (stored) document.documentElement.dataset.theme = stored;
    const isDark = () => (document.documentElement.dataset.theme ?? (media.matches ? 'dark' : 'light')) === 'dark';
    const sync = () => button.setAttribute('aria-pressed', String(isDark()));
    sync();
    media.addEventListener('change', sync);
    button.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      Storage.save(Storage.KEYS.theme, next);
      sync();
      announce(`${next === 'dark' ? 'Dark' : 'Light'} theme on.`);
    });
  },
};

/* ---------- App bootstrap & view routing ---------- */

const App = {
  importer: null,
  tabs: null,
  VIEWS: {
    auth: { el: '#auth-view', heading: '#auth-title', title: 'Ube Café Nutrition Planner: Meal Plans, Macro Targets & Grocery Lists' },
    onboarding: { el: '#onboarding-view', heading: '#wizard-title', title: 'Set up your profile · Ube Café' },
    app: { el: '#app-view', heading: '#app-title', title: 'Your meal plan · Ube Café' },
  },

  init() {
    ThemeUI.init();
    AuthView.init();
    OnboardingWizard.init();
    ProfileDrawer.init();
    DayRail.init();
    RecipeLibrary.init();
    PlannerUI.init();
    ScheduleUI.init();
    GroceryUI.init();
    this.importer = new RecipeImporter($('#library-importer'), {
      prefix: 'lib',
      onSaved: (recipe, isUpdate) => {
        this.renderAll();
        announce(`${isUpdate ? 'Updated' : 'Saved'} “${recipe.title}”. It is now available in the weekly planner.`);
      },
    });
    this.tabs = new Tabs($('#app-tablist'), {
      onChange: (id) => {
        DayRail.toggleFor(id);
        state.ui = { ...state.ui, tab: id };
        if (state.account) Storage.save(Storage.KEYS.ui, state.ui);
      },
    });
    $('#year').textContent = String(new Date().getFullYear());

    const email = AuthManager.restoreSession();
    if (email) this.enter(email, { focus: false });
    else this.showView('auth', { focus: false });
  },

  /** Loads a signed-in account and routes to onboarding or the dashboard. */
  enter(email, { focus = true } = {}) {
    Storage.scope = email;
    state.account = { email, ...AuthManager.account(email) };
    Object.assign(state, loadUserData());
    if (!Storage.load(Storage.KEYS.recipes, null)) {
      // First sign-in: persist the sample library and plan for this account.
      Storage.save(Storage.KEYS.recipes, state.recipes);
      Storage.save(Storage.KEYS.plan, state.plan);
    }
    if (state.profile.onboarded) this.showApp({ focus });
    else OnboardingWizard.start('onboarding');
  },

  showView(name, { focus = true } = {}) {
    Object.entries(this.VIEWS).forEach(([key, view]) => { $(view.el).hidden = key !== name; });
    $('#profile-button').hidden = name !== 'app';
    document.title = this.VIEWS[name].title;
    window.scrollTo(0, 0);
    if (focus) $(this.VIEWS[name].heading).focus();
  },

  showApp({ focus = true } = {}) {
    ScheduleUI.syncForm();
    GroceryUI.syncForm();
    this.importer.reset();
    $('#app-name').textContent = firstName();
    this.renderAll();
    this.showView('app', { focus });
    this.tabs.select(state.ui.tab);
  },

  setViewDay(day) {
    state.viewDay = day;
    this.renderNutrition();
  },

  /** Re-renders every recipe-dependent view. */
  renderAll() {
    RecipeLibrary.render();
    PlannerUI.render();
    this.renderNutrition();
    GroceryUI.render();
  },

  /** Re-renders everything derived from targets and the viewed day. */
  renderNutrition() {
    DayRail.sync();
    TargetsUI.render();
    const day = DashboardUI.render();
    RecommendationsUI.render(day);
    ScheduleUI.render(day.meals);
    PlannerUI.renderSlots();
    ProfileDrawer.renderButton();
    const { profile } = state;
    $('#app-summary').textContent = `${NutritionEngine.GOALS[profile.goal].label} · ${DIETS[profile.diet].label} · ${fmt(currentTargets().targets.calories)} kcal a day`;
  },

  signOut(message) {
    const dialog = $('#profile-drawer');
    if (dialog.open) dialog.close();
    const name = state.account ? firstName() : '';
    AuthManager.signOut();
    Storage.scope = null;
    state.account = null;
    // Clear the previous user's rendered data from the hidden app view.
    ['#macro-list', '#micro-list', '#recommendation-list', '#targets-output', '#recipe-library', '#palette-list', '#planner-slots', '#day-totals-body', '#timeline', '#grocery-list']
      .forEach((sel) => { $(sel).innerHTML = ''; });
    AuthView.reset();
    this.showView('auth');
    announce(message ?? `Signed out${name ? `. See you soon, ${name}` : ''}.`);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
