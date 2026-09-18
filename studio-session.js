// studio-session.js
//
// Tracks who is using the studio so the interface can adapt without asking the
// server on every action.
//
//   signedIn=false                  a visitor: the whole app works, progress is
//                                   kept in this browser (see studio-guest.js)
//   signedIn=true, isOwner=true     the curator: may edit the shared library
//   signedIn=true, isOwner=false    a member: personal lists plus shared study
window.StudioSession = (() => {
    'use strict';

    let signedIn = false;
    let isOwner = false;

    function markSignedIn(owner) {
        signedIn = true;
        isOwner = owner === true;
    }

    function markSignedOut() {
        signedIn = false;
        isOwner = false;
    }

    function can(curiosity) {
        if (curiosity === 'editShared') return signedIn && isOwner;
        if (curiosity === 'editPersonal') return signedIn;
        return signedIn;
    }

    return {
        isSignedIn: () => signedIn,
        isOwner: () => isOwner,
        markSignedIn,
        markSignedOut,
        can,
        // Wording for the account control, which is also the sign-in entry point.
        accountLabel: () => (signedIn ? (isOwner ? 'Account (owner)' : 'Account') : 'Sign in')
    };
})();
