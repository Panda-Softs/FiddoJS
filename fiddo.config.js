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
    defaultMessage: "Cette valeur semble non valide",
    type: {
        email:    "Cette valeur n'est pas une adresse email valide",
        url:      "Cette valeur n'est pas une URL valide",
        number:   "Cette valeur doit être un nombre",
        integer:  "Cette valeur doit être un entier",
        digits:   "Cette valeur doit être numérique",
        alphanum: "Cette valeur doit être alphanumérique",

        tel:       "Cette valeur n'est pas un téléphone valide",
        // custom
        phone:    "Cette valeur n'est pas un téléphone valide",
        name:     "Cette valeur n'est pas un nom valide"
    },
    notblank:       "Cette valeur ne peut pas être vide",
    required:       "Ce champ est requis",
    minrequired:    "At least %s input(s) are required",
    pattern:        "Cette valeur semble non valide",
    min:            "Cette valeur ne doit pas être inférieure à %s",
    max:            "Cette valeur ne doit pas excéder %s",
    range:          "Cette valeur doit être comprise entre %s et %s",
    minlength:      "Cette chaîne est trop courte. Elle doit avoir au minimum %s caractères",
    maxlength:      "Cette chaîne est trop longue. Elle doit avoir au maximum %s caractères",
    length:         "Cette valeur doit contenir entre %s et %s caractères",
    mincheck:       "Vous devez sélectionner au moins %s choix",
    maxcheck:       "Vous devez sélectionner %s choix maximum",
    check:          "Vous devez sélectionner entre %s et %s choix",
    equalto:        "Cette valeur devrait être identique",
    // extra
    dateiso:    "Cette valeur n'est pas une date valide (YYYY-MM-DD)",
    minwords:   "Cette valeur est trop courte. Elle doit contenir au moins %s mots",
    maxwords:   "Cette valeur est trop longue. Elle doit contenir tout au plus %s mots",
    words:      "Cette valeur est invalide. Elle doit contenir entre %s et %s mots",
    gt:         "Cette valeur doit être plus grande",
    gte:        "Cette valeur doit être plus grande ou égale",
    lt:         "Cette valeur doit être plus petite",
    lte:        "Cette valeur doit être plus petite ou égale",
    notequalto: "Cette valeur doit être différente",

    // extras validators
    money:      "Veuillez entrer un montant valide supérieur à zéro",

    date:       "La date saisie est invalide (format attendu : %s)",
    datemin:    "La date ne peut pas être antérieure au %s",
    datemax:    "La date ne peut pas être postérieure au %s",
    datepast:   "La date ne peut pas être postérieure à aujourd'hui",
    datefuture: "La date ne peut pas être antérieure à aujourd'hui"
};
