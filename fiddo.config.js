window.FiddoPluginName = 'Parsley';

window.ParsleyConfig = {
    debug : true,
    autoBind : true,
    trigger: 'change',
    triggerAfterFailure: 'input change',
    errorTemplate: '<li class="helper-text"></li>',
    successClass: 'valid',
    errorClass: 'invalid',
    classHandler: function (field) {
        if (field.$element.is('select.selectized')) {
            return field.$element.siblings('.selectize-control');
        } else if (field.$element.is('textarea.editable')) {
            return field.$element.siblings('div.il__trigger');
        }
    }
}

window.ParsleyConfig.Messages = {
    defaultMessage: "Ce champ est invalide.",

    type: {
        email:    "Entrez une adresse e-mail valide.",
        url:      "Entrez une URL valide.",
        number:   "Entrez un nombre.",
        integer:  "Entrez un entier.",
        digits:   "Utilisez uniquement des chiffres.",
        alphanum: "Utilisez des caractères alphanumériques.",
        tel:      "Entrez un numéro de téléphone valide.",
        // personnalisés
        phone:    "Entrez un numéro de téléphone valide.",
        name:     "Entrez un nom valide."
    },

    notblank:    "Ce champ ne peut pas être vide.",
    required:    "Ce champ est requis.",
    minrequired: "Au moins %s champs requis",

    pattern:   "Format invalide.",
    min:       "La valeur doit être au moins %s.",
    max:       "La valeur doit être au plus %s.",
    range:     "La valeur doit être entre %s et %s.",

    minlength: "Ce champ doit contenir au moins %s caractères.",
    maxlength: "Ce champ doit contenir au plus %s caractères.",
    length:    "Ce champ doit contenir entre %s et %s caractères.",

    mincheck: "Sélectionnez au moins %s choix.",
    maxcheck: "Sélectionnez au plus %s choix.",
    check:    "Sélectionnez entre %s et %s choix.",

    equalto:    "Les valeurs doivent être identiques.",
    notequalto: "Cette valeur doit être différente.",

    // extras
    dateiso:  "Date invalide (YYYY-MM-DD).",
    minwords: "Ce champ doit contenir au moins %s mots.",
    maxwords: "Ce champ doit contenir au plus %s mots.",
    words:    "Ce champ doit contenir entre %s et %s mots.",

    gt:  "La valeur doit être > %s.",
    gte: "La valeur doit être ≥ %s.",
    lt:  "La valeur doit être < %s.",
    lte: "La valeur doit être ≤ %s.",

    // validateurs additionnels
    money:      "Entrez un montant > 0.",
    date:       "Date invalide (format attendu : %s).",
    datemin:    "La date ne peut pas être antérieure au %s.",
    datemax:    "La date ne peut pas être postérieure au %s.",
    datepast:   "La date ne peut pas être dans le futur.",
    datefuture: "La date ne peut pas être dans le passé."
};
