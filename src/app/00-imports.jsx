// F1.4 assets (begin) — images moved out of the code into src/assets/ (see MANIFEST.json)
import __asset_welcome_bg from "@nextrep-assets/welcome-bg.jpg";
import __asset_muscle_klatka from "@nextrep-assets/muscle-klatka.jpg";
import __asset_muscle_plecy from "@nextrep-assets/muscle-plecy.jpg";
import __asset_muscle_nogi from "@nextrep-assets/muscle-nogi.jpg";
import __asset_muscle_lydki from "@nextrep-assets/muscle-lydki.jpg";
import __asset_muscle_barki from "@nextrep-assets/muscle-barki.jpg";
import __asset_muscle_biceps from "@nextrep-assets/muscle-biceps.jpg";
import __asset_muscle_triceps from "@nextrep-assets/muscle-triceps.jpg";
import __asset_muscle_brzuch from "@nextrep-assets/muscle-brzuch.jpg";
import __asset_muscle_posladki from "@nextrep-assets/muscle-posladki.jpg";
import __asset_muscle_przedramiona from "@nextrep-assets/muscle-przedramiona.jpg";
import __asset_muscle_cale_cialo from "@nextrep-assets/muscle-cale-cialo.jpg";
import __asset_muscle_cardio from "@nextrep-assets/muscle-cardio.jpg";
import __asset_plan_fbw from "@nextrep-assets/plan-fbw.jpg";
import __asset_plan_split from "@nextrep-assets/plan-split.jpg";
import __asset_plan_5x5 from "@nextrep-assets/plan-5x5.jpg";
import __asset_plan_ppl from "@nextrep-assets/plan-ppl.jpg";
import __asset_plan_home from "@nextrep-assets/plan-home.jpg";
import __asset_plan_glutes from "@nextrep-assets/plan-glutes.jpg";
import __asset_plan_bands from "@nextrep-assets/plan-bands.jpg";
import __asset_plan_abs from "@nextrep-assets/plan-abs.jpg";
import __asset_nextrep_symbol from "@nextrep-assets/nextrep-symbol.png";
import __asset_nextrep_logo from "@nextrep-assets/nextrep-logo.png";
import __asset_nextrep_logo_stacked from "@nextrep-assets/nextrep-logo-stacked.png";
// F1.4 assets (end)
// F1.5 engine — the progression engine lives in src/engine/ (real ES module)
import {
  toNumber,
  parseRepRange,
  parseRirBounds,
  overallRepRange,
  noteOverride,
  avgOf,
  computeSessionVolume,
  PROGRESSION_MAX_PERFORMANCES,
  PROGRESSION_LONG_BREAK_DAYS,
  summarizePerformance,
  sumTopK,
  comparePerformances,
  computeExerciseAnalysis,
  exerciseHistoryBefore,
  analyzeSessionExercise,
  MUSCLE_GROUPS,
  CATEGORY_TO_MUSCLE_GROUP,
  ATLAS_MUSCLE_GROUPS,
  getExerciseMuscleGroups,
  WORKLOAD_UNIT_BY_KIND,
  computeMuscleGroupWorkload,
  workloadMainUnit,
  computeProgressSignal,
  muscleGroupSessionPoints,
  computeCategoryLastDelta,
  getHistoricalBest,
  findMatchingSessions,
} from "@nextrep-engine";
// PE-A (A4.5) volume access point — every volume shown on a screen comes from here
import {
  sessionVolume,
  exerciseVolume,
  muscleGroupWorkload,
  muscleGroupPoints,
  muscleGroupLastDelta,
  exerciseDetailVolume,
  draftVolume,
} from "@nextrep-engine";
// AT2: the approved atlas release — read ONLY by the catalog adapter (17b-atlas-catalog.jsx)
import { ATLAS_RELEASE } from "@nextrep-engine";
// I3: the nr1 contracts and the snapshot builder — used ONLY by the atlas adapter (17b-atlas-catalog.jsx)
import { validateLoadSnapshot, planItemSnapshot, resolvePlanItemLoadModel, LOAD_MODEL_CHOICE_LABELS, validateRefMatchesSnapshot } from "@nextrep-engine";















import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { createClient } from "@supabase/supabase-js";
import {
  Home, Dumbbell, ClipboardList, PlayCircle, History as HistoryIcon, Ruler, Repeat,
  Plus, X, Check, ChevronRight, ChevronLeft, Trash2, Pencil, TrendingUp, Target,
  TrendingDown, Minus, Clock, ArrowLeft, Link2, Timer as TimerIcon, Flame,
  ChevronUp, ChevronDown, Search, Heart, ArrowUpDown, Footprints,
  CircleDot, Zap, Hexagon, Circle, Hand, PersonStanding, CalendarPlus, CalendarDays,
  AlertTriangle, Layers, ChevronDown as CaretDown, Download, Upload, MessageSquare, Activity, Lock, MoreHorizontal, MoreVertical,
  Mail, Eye, EyeOff, LogOut, UserCircle2, ShieldAlert, UploadCloud, Database, RefreshCw, WifiOff,
  BarChart3, LineChart, CheckCircle2
} from "lucide-react";

// I4: icons used by the approved UI masters (canvas v81) and not imported above
import { Flag, ListOrdered, PauseCircle, Info, Calendar, CalendarCheck, ArrowRight, CloudOff, Trophy, ListChecks, Hourglass, Sigma, Sparkles, Pause, Play, RotateCcw, Smartphone, Cloud, CircleSlash, Shield, Lightbulb, Video, Link as LinkIcon } from "lucide-react";
// I5 (ATLAS-UX-01): navigation hierarchy and the atlas search / hierarchy engines — used ONLY by the browse adapter (17c-atlas-browse.jsx)
import { ATLAS_NAVIGATION, buildAtlasIndex, ATLAS_FACET_DIMENSIONS, buildHierarchyIndex, validateHierarchy } from "@nextrep-engine";
// I5.2 (ATLAS-UX-01): icons of the components P1–P9 not imported above
import { SlidersHorizontal, XCircle, RefreshCcw } from "lucide-react";
// I5.3 (ATLAS-UX-01): the list icon of „Wszystkie ćwiczenia” (E01 / E02)
import { List as ListIcon } from "lucide-react";
// DES-01 / D1: the user's own exercises and the user catalog — used ONLY by the data layer (05b-user-exercise-data.jsx)
import { privateExerciseContext, createPrivateExercise, updatePrivateExercise, deriveFromPrivateExercise, archivePrivateExercise, restorePrivateExercise, countExerciseUsage, canDeletePrivateExercise, upsertPrivateExercise, removePrivateExerciseFromList, isPrivateExerciseId, buildUserCatalog, normalizeExerciseNames, setCustomExerciseName, removeCustomExerciseName, normalizeFavourites, toggleFavourite, normalizeExerciseMedia, userExerciseDataProblems, USER_EXERCISE_DATA_FIELDS } from "@nextrep-engine";
// DES-01 / D2: the display record of an atlas exercise with a private name — used ONLY by the browse adapter (17c-atlas-browse.jsx)
import { displayAtlasRecord } from "@nextrep-engine";
// DES-01 / D2: icons of the shortcut tiles, origin badges and the card menu
import { Tag, Archive, UserRound, CopyPlus, ArchiveRestore, Eraser } from "lucide-react";
// DES-01 / D2-FIX-01: the variant icon of the card menu (board D09c)
import { GitBranch } from "lucide-react";
