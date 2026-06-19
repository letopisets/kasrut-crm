export interface MapTranslations {
  appName: string
  suggestBusiness: string
  darkTheme: string
  lightTheme: string
  filtersTooltip: string
  logout: string
  loginTooltip: string
  establishmentCount: string       // template: "{n} …"
  establishmentCountLimited: string // template: "{shown} … {total} …"
  updatingMap: string
  correctLocation: string
  myLocation: string
  detectingLocation: string

  filterTitle: string
  resetAll: string
  foodTypeSection: string
  categorySection: string
  hechsherSection: string
  citySection: string
  radiusSection: string
  showResults: string
  allCities: string
  radiusLabels: readonly [string, string, string, string, string, string, string, string]

  foodType: { meat: string; dairy: string; pareve: string; takeaway: string }
  kashrutLevel: { mehadrin: string; badatz: string; regular: string }

  certificate: string
  buildRoute: string
  enableGeolocation: string
  suggestEdit: string
  detailWarning: string

  reviewsTitle: string
  avgRating: string                 // template: "{avg} / 5 · {count}"
  noReviews: string
  loadReviewsError: string
  reviewSaved: string
  rateError: string
  saveReviewError: string
  updateYourReview: string
  yourReview: string
  reviewPlaceholder: string
  reviewPlaceholderGuest: string
  saveReview: string
  loginAndReview: string
  loadingReviews: string

  suggestNewTitle: string
  suggestEditTitle: string
  loginToSuggest: string
  loginBtn: string
  suggestionSent: string
  suggestionError: string
  suggestionLocationError: string
  locatingAddress: string
  currentEstablishment: string      // template: "{name}, {address}, {city}"
  nameField: string
  addressField: string
  cityField: string
  hechsherField: string
  hechsherPlaceholder: string
  newHechsherHint: string
  kashrutStatusField: string
  foodTypeField: string
  foodTypeAny: string
  categoryField: string
  categoryAny: string
  category: { restaurant: string; bakery: string; cafe: string }
  imageField: string
  imageHint: string
  imageAdd: string
  imageAddCamera: string
  imageAddGallery: string
  imageRemove: string
  imageProcessing: string
  imageError: string
  kashrutPhotoNotice: string
  kashrutPhotoRequired: string
  notesField: string
  notesPlaceholder: string
  closeBtn: string
  cancelBtn: string
  submitBtn: string
  statusOptions: readonly [string, string, string, string]

  routeTitle: string
  navModeSteps: string
  navModeNavigate: string
  startNavigation: string
  startingNavigation: string
  endNavigation: string
  showSteps: string
  recenter: string
  inMeters: string                 // template: "in {d}"
  arrived: string

  legalNotice: string

  accountTitle: string
  authDescription: string
  loginTab: string
  registerTab: string
  resetTab: string
  oauthError: string
  wrongCredentials: string
  registerError: string
  resetRequestError: string
  resetConfirmError: string

  emailField: string
  passwordField: string
  loginBtn2: string
  forgotPassword: string

  firstName: string
  lastName: string
  phoneField: string
  passwordHint: string
  registerBtn: string

  sendCodeTo: string
  emailOption: string
  phoneOption: string
  getCode: string
  codeSent: string
  devCodePrefix: string
  resetCode: string
  newPassword: string
  changePassword: string

  addressPlaceholder: string
  cancelSearch: string
  clickOnMap: string

  noEstablishments: string
  tryFilters: string
  foundCount: string                // template: "{n} …"

  signInWithGoogle: string
  googleSignInError: string
  appleSignInError: string

  donate: string
  donateTitle: string
  donateIntro: string
  donateUkraineInternational: string
  donateUkraineDomestic: string
  donateIsraelBit: string
  donateIban: string
  donateBic: string
  donateReceiver: string
  donateCardNumber: string
  donateBitPhone: string
  donateCopy: string
  donateCopied: string
  donateBack: string
  donateThanks: string

  sessionExpired: string
}
