/**
 * Meal library and two-week rotation.
 * Base portions add up to ~1,900 kcal/day; everything scales to the calorie target.
 */
(function() {
    const F = window.Fitness = window.Fitness || {};

    const BASE_DAY_KCAL = 1900;
    const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
    const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

    // kcal / protein / carbs / fat, ingredients as [item, qty, aisle]
    const MEALS = [
        // ---------- Breakfasts (~450) ----------
        { id: 'b_yogurt_bowl', slot: 'breakfast', name: 'Greek Yogurt Berry Bowl', kcal: 430, p: 26, c: 58, f: 10, prep: 'Layer and eat. 3 minutes.',
          ing: [['2% Greek yogurt', '1 cup', 'dairy'], ['Mixed berries', '½ cup', 'produce'], ['Granola', '¼ cup', 'pantry'], ['Honey', '1 tbsp', 'pantry']] },
        { id: 'b_veg_scramble', slot: 'breakfast', name: 'Veggie Egg Scramble + Toast', kcal: 450, p: 26, c: 22, f: 29, prep: 'Scramble eggs with sautéed veg, serve on toast with avocado.',
          ing: [['Eggs', '3', 'dairy'], ['Spinach', '1 cup', 'produce'], ['Bell pepper', '½', 'produce'], ['Whole-grain bread', '1 slice', 'bakery'], ['Avocado', '¼', 'produce']] },
        { id: 'b_overnight_oats', slot: 'breakfast', name: 'Protein Overnight Oats', kcal: 460, p: 38, c: 58, f: 8, prep: 'Mix the night before, refrigerate.',
          ing: [['Rolled oats', '½ cup', 'pantry'], ['Milk (2%)', '1 cup', 'dairy'], ['Whey protein', '1 scoop', 'pantry'], ['Banana', '½', 'produce'], ['Cinnamon', 'pinch', 'pantry']] },
        { id: 'b_smoothie', slot: 'breakfast', name: 'Peanut Butter Berry Protein Smoothie', kcal: 450, p: 35, c: 55, f: 12, prep: 'Blend everything with ice.',
          ing: [['Whey protein', '1 scoop', 'pantry'], ['Banana', '1', 'produce'], ['Frozen berries', '1 cup', 'frozen'], ['Milk (2%)', '1 cup', 'dairy'], ['Peanut butter', '1 tbsp', 'pantry']] },
        { id: 'b_burrito', slot: 'breakfast', name: 'Turkey Sausage Breakfast Burrito', kcal: 460, p: 32, c: 30, f: 24, prep: 'Scramble eggs and sausage, wrap with salsa.',
          ing: [['Eggs', '2', 'dairy'], ['Turkey sausage links', '2', 'meat'], ['Whole-wheat tortilla', '1 large', 'bakery'], ['Salsa', '¼ cup', 'pantry']] },
        { id: 'b_cottage_toast', slot: 'breakfast', name: 'Cottage Cheese, Fruit & Toast', kcal: 420, p: 32, c: 42, f: 12, prep: 'Assemble. Swap the peach for any fruit in season.',
          ing: [['2% cottage cheese', '1 cup', 'dairy'], ['Peach or apple', '1', 'produce'], ['Whole-grain bread', '1 slice', 'bakery'], ['Butter', '1 tsp', 'dairy']] },
        { id: 'b_eggwhite_omelet', slot: 'breakfast', name: 'Egg-White Cheddar Omelet + Apple', kcal: 430, p: 40, c: 30, f: 14, prep: 'Cook whites with mushrooms, fold in cheese.',
          ing: [['Liquid egg whites', '1 cup', 'dairy'], ['Cheddar, shredded', '¼ cup', 'dairy'], ['Mushrooms', '½ cup', 'produce'], ['Apple', '1', 'produce']] },
        { id: 'b_protein_pancakes', slot: 'breakfast', name: 'Oat Protein Pancakes', kcal: 450, p: 36, c: 60, f: 6, prep: 'Blend oats, whites and whey into batter; cook 3 small pancakes.',
          ing: [['Rolled oats', '½ cup', 'pantry'], ['Liquid egg whites', '½ cup', 'dairy'], ['Whey protein', '½ scoop', 'pantry'], ['Mixed berries', '½ cup', 'produce'], ['Maple syrup', '1 tbsp', 'pantry']] },

        // ---------- Lunches (~550) ----------
        { id: 'l_burrito_bowl', slot: 'lunch', name: 'Chicken Burrito Bowl', kcal: 560, p: 47, c: 62, f: 12, prep: 'Batch-cook chicken and rice on Sunday.',
          ing: [['Chicken breast', '5 oz', 'meat'], ['Cooked rice', '¾ cup', 'pantry'], ['Black beans', '½ cup', 'pantry'], ['Salsa', '¼ cup', 'pantry'], ['Lettuce', '1 cup', 'produce'], ['Cheddar, shredded', '2 tbsp', 'dairy']] },
        { id: 'l_turkey_sandwich', slot: 'lunch', name: 'Turkey Avocado Sandwich + Apple', kcal: 540, p: 36, c: 62, f: 16, prep: 'Assemble.',
          ing: [['Deli turkey', '4 oz', 'meat'], ['Whole-grain bread', '2 slices', 'bakery'], ['Avocado', '¼', 'produce'], ['Lettuce & tomato', 'a few slices', 'produce'], ['Mustard', '1 tsp', 'pantry'], ['Apple', '1', 'produce']] },
        { id: 'l_tuna_wrap', slot: 'lunch', name: 'Tuna Salad Wrap + Grapes', kcal: 520, p: 40, c: 60, f: 12, prep: 'Mix tuna with light mayo, wrap with greens.',
          ing: [['Canned tuna', '1 can (5 oz)', 'pantry'], ['Light mayo', '1 tbsp', 'pantry'], ['Whole-wheat wrap', '1', 'bakery'], ['Mixed greens', '1 cup', 'produce'], ['Grapes', '1 cup', 'produce']] },
        { id: 'l_caesar', slot: 'lunch', name: 'Grilled Chicken Caesar (Light)', kcal: 530, p: 48, c: 30, f: 24, prep: 'Slice chicken over romaine; go light on dressing.',
          ing: [['Chicken breast', '5 oz', 'meat'], ['Romaine', '3 cups', 'produce'], ['Light Caesar dressing', '2 tbsp', 'pantry'], ['Parmesan', '2 tbsp', 'dairy'], ['Croutons', '¼ cup', 'bakery']] },
        { id: 'l_poke', slot: 'lunch', name: 'Salmon Poke Bowl', kcal: 570, p: 38, c: 60, f: 18, prep: 'Use sushi-grade or cooked salmon.',
          ing: [['Salmon', '4 oz', 'seafood'], ['Cooked rice', '¾ cup', 'pantry'], ['Edamame', '½ cup', 'frozen'], ['Cucumber', '½', 'produce'], ['Soy sauce', '1 tbsp', 'pantry'], ['Sriracha', 'to taste', 'pantry']] },
        { id: 'l_leftovers', slot: 'lunch', name: 'Leftover Protein, Veg & Rice', kcal: 550, p: 45, c: 55, f: 15, prep: 'Last night’s dinner protein, reheated.',
          ing: [['Leftover cooked protein', '5 oz', 'meat'], ['Mixed vegetables', '1 cup', 'frozen'], ['Cooked rice', '¾ cup', 'pantry']] },
        { id: 'l_greek_pita', slot: 'lunch', name: 'Greek Chicken Pita', kcal: 540, p: 46, c: 50, f: 16, prep: 'Stuff pita with chicken, tzatziki and veg.',
          ing: [['Chicken breast', '5 oz', 'meat'], ['Whole-wheat pita', '1', 'bakery'], ['Tzatziki', '3 tbsp', 'dairy'], ['Cucumber', '½', 'produce'], ['Tomato', '1', 'produce']] },
        { id: 'l_turkey_chili', slot: 'lunch', name: 'Turkey Chili + Tortilla Chips', kcal: 550, p: 40, c: 55, f: 16, prep: 'Batch-cook a pot on Sunday; freezes well.',
          ing: [['Ground turkey (93%)', '5 oz', 'meat'], ['Kidney beans', '½ cup', 'pantry'], ['Diced tomatoes', '½ cup', 'pantry'], ['Onion & pepper', '½ cup', 'produce'], ['Chili seasoning', '1 tbsp', 'pantry'], ['Tortilla chips', '1 oz', 'pantry']] },
        { id: 'l_shrimp_quinoa', slot: 'lunch', name: 'Lemon Shrimp Quinoa Salad', kcal: 540, p: 42, c: 48, f: 18, prep: 'Sauté shrimp, toss with quinoa and veg.',
          ing: [['Shrimp', '5 oz', 'seafood'], ['Cooked quinoa', '¾ cup', 'pantry'], ['Bell pepper', '½', 'produce'], ['Feta', '2 tbsp', 'dairy'], ['Lemon & olive oil', '1 tbsp', 'pantry']] },
        { id: 'l_steak_salad', slot: 'lunch', name: 'Steak Salad + Roll', kcal: 560, p: 40, c: 40, f: 26, prep: 'Slice leftover sirloin over greens.',
          ing: [['Sirloin steak', '4 oz', 'meat'], ['Mixed greens', '3 cups', 'produce'], ['Cherry tomatoes', '½ cup', 'produce'], ['Avocado', '¼', 'produce'], ['Balsamic vinaigrette', '1 tbsp', 'pantry'], ['Whole-grain roll', '1', 'bakery']] },

        // ---------- Dinners (~650) ----------
        { id: 'd_chicken_potato', slot: 'dinner', name: 'Grilled Chicken, Roasted Potatoes & Broccoli', kcal: 640, p: 52, c: 45, f: 24, prep: 'Roast potatoes and broccoli at 425°F for 25 min.',
          ing: [['Chicken breast', '6 oz', 'meat'], ['Baby potatoes', '6 oz', 'produce'], ['Broccoli', '1½ cups', 'produce'], ['Olive oil', '1 tbsp', 'pantry']] },
        { id: 'd_salmon_rice', slot: 'dinner', name: 'Baked Salmon, Rice & Asparagus', kcal: 660, p: 42, c: 45, f: 30, prep: 'Bake salmon 12 min at 400°F.',
          ing: [['Salmon', '6 oz', 'seafood'], ['Cooked rice', '¾ cup', 'pantry'], ['Asparagus', '1 bunch', 'produce'], ['Lemon', '½', 'produce']] },
        { id: 'd_beef_stirfry', slot: 'dinner', name: 'Lean Beef & Veggie Stir-Fry', kcal: 650, p: 48, c: 58, f: 20, prep: 'High heat, 10 minutes, sauce at the end.',
          ing: [['Sirloin, sliced', '6 oz', 'meat'], ['Stir-fry vegetables', '2 cups', 'frozen'], ['Cooked rice', '¾ cup', 'pantry'], ['Soy sauce & garlic', '2 tbsp', 'pantry']] },
        { id: 'd_turkey_meatballs', slot: 'dinner', name: 'Turkey Meatballs & Whole-Wheat Pasta', kcal: 660, p: 50, c: 72, f: 16, prep: 'Bake meatballs 20 min; simmer in marinara.',
          ing: [['Ground turkey (93%)', '6 oz', 'meat'], ['Whole-wheat pasta', '1½ cups cooked', 'pantry'], ['Marinara', '¾ cup', 'pantry'], ['Parmesan', '1 tbsp', 'dairy']] },
        { id: 'd_shrimp_tacos', slot: 'dinner', name: 'Shrimp Tacos with Slaw', kcal: 620, p: 45, c: 60, f: 20, prep: 'Sauté shrimp with cumin; Greek yogurt + lime for the crema.',
          ing: [['Shrimp', '6 oz', 'seafood'], ['Corn tortillas', '3', 'bakery'], ['Cabbage slaw mix', '1 cup', 'produce'], ['Greek yogurt', '2 tbsp', 'dairy'], ['Lime', '1', 'produce']] },
        { id: 'd_pork_sweetpotato', slot: 'dinner', name: 'Pork Tenderloin, Sweet Potato & Green Beans', kcal: 640, p: 50, c: 50, f: 18, prep: 'Roast pork to 145°F; microwave sweet potato.',
          ing: [['Pork tenderloin', '6 oz', 'meat'], ['Sweet potato', '6 oz', 'produce'], ['Green beans', '1½ cups', 'produce'], ['Butter', '1 tsp', 'dairy']] },
        { id: 'd_fajita_bowl', slot: 'dinner', name: 'Chicken Fajita Bowl', kcal: 640, p: 50, c: 55, f: 22, prep: 'Sear chicken with peppers and onions.',
          ing: [['Chicken breast', '6 oz', 'meat'], ['Bell peppers & onion', '1½ cups', 'produce'], ['Cooked rice', '¾ cup', 'pantry'], ['Avocado', '¼', 'produce'], ['Salsa', '¼ cup', 'pantry']] },
        { id: 'd_sheetpan_sausage', slot: 'dinner', name: 'Sheet-Pan Chicken Sausage & Veg', kcal: 620, p: 38, c: 55, f: 26, prep: 'Everything on one pan, 425°F for 25 min.',
          ing: [['Chicken sausage', '2 links', 'meat'], ['Baby potatoes', '5 oz', 'produce'], ['Brussels sprouts', '1½ cups', 'produce'], ['Olive oil', '1 tbsp', 'pantry']] },
        { id: 'd_burger_bowl', slot: 'dinner', name: 'Burger Bowl with Potato Wedges', kcal: 650, p: 50, c: 35, f: 32, prep: 'Cook 93% beef patty; roast wedges.',
          ing: [['Ground beef (93%)', '6 oz', 'meat'], ['Lettuce, tomato, pickles', '1½ cups', 'produce'], ['Cheddar', '1 oz', 'dairy'], ['Potato', '4 oz', 'produce']] },
        { id: 'd_cod_quinoa', slot: 'dinner', name: 'Lemon Cod, Quinoa & Zucchini', kcal: 600, p: 50, c: 45, f: 20, prep: 'Pan-sear cod 4 min per side.',
          ing: [['Cod', '8 oz', 'seafood'], ['Cooked quinoa', '¾ cup', 'pantry'], ['Zucchini', '1', 'produce'], ['Olive oil', '1 tbsp', 'pantry'], ['Lemon', '½', 'produce']] },
        { id: 'd_chicken_curry', slot: 'dinner', name: 'Light Coconut Chicken Curry & Rice', kcal: 680, p: 45, c: 58, f: 28, prep: 'Simmer thighs with curry paste and light coconut milk.',
          ing: [['Chicken thighs, boneless', '6 oz', 'meat'], ['Light coconut milk', '½ cup', 'pantry'], ['Curry paste', '1 tbsp', 'pantry'], ['Mixed vegetables', '1 cup', 'frozen'], ['Cooked rice', '¾ cup', 'pantry']] },
        { id: 'd_steak_potato', slot: 'dinner', name: 'Sirloin, Baked Potato & Salad', kcal: 660, p: 50, c: 50, f: 26, prep: 'Sear steak 3–4 min per side, rest 5.',
          ing: [['Sirloin steak', '6 oz', 'meat'], ['Potato', '6 oz', 'produce'], ['Mixed greens', '2 cups', 'produce'], ['Vinaigrette', '1 tbsp', 'pantry']] },

        // ---------- Snacks (~250) ----------
        { id: 's_shake', slot: 'snack', name: 'Protein Shake', kcal: 200, p: 30, c: 8, f: 3, prep: 'Whey with water or milk.',
          ing: [['Whey protein', '1 scoop', 'pantry'], ['Milk (2%)', '1 cup', 'dairy']] },
        { id: 's_apple_pb', slot: 'snack', name: 'Apple + Peanut Butter', kcal: 280, p: 8, c: 30, f: 16, prep: '',
          ing: [['Apple', '1', 'produce'], ['Peanut butter', '2 tbsp', 'pantry']] },
        { id: 's_yogurt_honey', slot: 'snack', name: 'Greek Yogurt with Honey', kcal: 220, p: 20, c: 30, f: 2, prep: '',
          ing: [['2% Greek yogurt', '1 cup', 'dairy'], ['Honey', '1 tbsp', 'pantry']] },
        { id: 's_jerky_orange', slot: 'snack', name: 'Beef Jerky + Orange', kcal: 230, p: 20, c: 25, f: 4, prep: '',
          ing: [['Beef jerky', '1½ oz', 'pantry'], ['Orange', '1', 'produce']] },
        { id: 's_cottage_pineapple', slot: 'snack', name: 'Cottage Cheese + Pineapple', kcal: 220, p: 22, c: 20, f: 4, prep: '',
          ing: [['2% cottage cheese', '¾ cup', 'dairy'], ['Pineapple chunks', '½ cup', 'produce']] },
        { id: 's_eggs_cheese', slot: 'snack', name: 'Hard-Boiled Eggs + String Cheese', kcal: 240, p: 20, c: 2, f: 16, prep: 'Boil a dozen eggs on Sunday.',
          ing: [['Eggs', '2', 'dairy'], ['String cheese', '1', 'dairy']] }
    ];

    const BY_ID = {};
    MEALS.forEach(function(m) { BY_ID[m.id] = m; });

    function bySlot(slot) {
        return MEALS.filter(function(m) { return m.slot === slot; });
    }

    const D = F.dates;

    /** Portion multiplier for a calorie target (clamped so recipes stay sane). */
    function scaleFactor(targetKcal) {
        if (!targetKcal) return 1;
        const f = targetKcal / BASE_DAY_KCAL;
        return Math.round(Math.min(1.4, Math.max(0.7, f)) * 100) / 100;
    }

    function scaleMeal(meal, factor) {
        factor = factor || 1;
        return Object.assign({}, meal, {
            kcal: Math.round(meal.kcal * factor),
            p: Math.round(meal.p * factor),
            c: Math.round(meal.c * factor),
            f: Math.round(meal.f * factor),
            factor: factor
        });
    }

    /** Rotation day index (0–13) for a date. */
    function rotationDay(profile, date) {
        const start = profile && profile.startDate ? D.parse(profile.startDate) : new Date(2026, 0, 5);
        const diff = D.daysBetween(start, date || new Date());
        return ((diff % 14) + 14) % 14;
    }

    /** { breakfast: meal, lunch: meal, dinner: meal, snack: meal } scaled to targetKcal. */
    function planForDate(profile, date, targetKcal) {
        const day = rotationDay(profile, date);
        const factor = scaleFactor(targetKcal);
        const plan = {};
        SLOTS.forEach(function(slot) {
            const options = bySlot(slot);
            plan[slot] = scaleMeal(options[day % options.length], factor);
        });
        plan.factor = factor;
        plan.total = SLOTS.reduce(function(sum, s) { return sum + plan[s].kcal; }, 0);
        return plan;
    }

    /** Aggregated grocery list for the 7 days starting at weekStart. */
    function groceryList(profile, weekStart, targetKcal) {
        const items = {};
        for (let i = 0; i < 7; i++) {
            const d = D.addDays(weekStart, i);
            const plan = planForDate(profile, d, targetKcal);
            SLOTS.forEach(function(slot) {
                plan[slot].ing.forEach(function(ing) {
                    const key = ing[0];
                    if (!items[key]) items[key] = { item: key, aisle: ing[2], qtys: [], days: 0 };
                    items[key].qtys.push(ing[1]);
                    items[key].days++;
                });
            });
        }
        const aisleOrder = ['produce', 'meat', 'seafood', 'dairy', 'bakery', 'frozen', 'pantry'];
        return Object.values(items).sort(function(a, b) {
            const ai = aisleOrder.indexOf(a.aisle), bi = aisleOrder.indexOf(b.aisle);
            if (ai !== bi) return ai - bi;
            return a.item.localeCompare(b.item);
        });
    }

    function search(query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return MEALS.slice();
        return MEALS.filter(function(m) {
            return m.name.toLowerCase().includes(q) || m.slot.includes(q) ||
                m.ing.some(function(i) { return i[0].toLowerCase().includes(q); });
        });
    }

    F.meals = {
        SLOTS: SLOTS,
        SLOT_LABELS: SLOT_LABELS,
        BASE_DAY_KCAL: BASE_DAY_KCAL,
        MEALS: MEALS,
        byId: function(id) { return BY_ID[id] || null; },
        bySlot: bySlot,
        scaleFactor: scaleFactor,
        scaleMeal: scaleMeal,
        rotationDay: rotationDay,
        planForDate: planForDate,
        groceryList: groceryList,
        search: search
    };
})();
