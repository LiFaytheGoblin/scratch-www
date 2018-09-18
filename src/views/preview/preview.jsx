// preview view can show either project page or editor page;
// idea is that we shouldn't require a page reload to switch back and forth

const bindAll = require('lodash.bindall');
const React = require('react');
const PropTypes = require('prop-types');
const connect = require('react-redux').connect;
const injectIntl = require('react-intl').injectIntl;
const parser = require('scratch-parser');
const Page = require('../../components/page/www/page.jsx');
const api = require('../../lib/api');
const render = require('../../lib/render.jsx');
const storage = require('../../lib/storage.js').default;
const log = require('../../lib/log');
const EXTENSION_INFO = require('../../lib/extensions.js').default;

const PreviewPresentation = require('./presentation.jsx');
const projectShape = require('./projectshape.jsx').projectShape;

const sessionActions = require('../../redux/session.js');
const previewActions = require('../../redux/preview.js');

const GUI = require('scratch-gui');
const IntlGUI = injectIntl(GUI.default);

class Preview extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'addEventListeners',
            'handleToggleStudio',
            'handleFavoriteToggle',
            'handleLoadMore',
            // temporary, to pass to GUI. Remove when nav bar components are shared between www and gui.
            'handleLogout',
            'handleLoveToggle',
            'handlePermissions',
            'handlePopState',
            'handleReportClick',
            'handleReportClose',
            'handleReportSubmit',
            'handleAddToStudioClick',
            'handleAddToStudioClose',
            'handleSeeInside',
            'handleUpdateProjectTitle',
            'handleUpdate',
            'initCounts',
            'isShared',
            'pushHistory',
            'userOwnsProject'
        ]);
        const pathname = window.location.pathname.toLowerCase();
        const parts = pathname.split('/').filter(Boolean);
        // parts[0]: 'preview'
        // parts[1]: either :id or 'editor'
        // parts[2]: undefined if no :id, otherwise either 'editor' or 'fullscreen'
        this.state = {
            editable: false,
            extensions: [],
            favoriteCount: 0,
            loveCount: 0,
            projectId: parts[1] === 'editor' ? 0 : parts[1],
            addToStudioOpen: false,
            reportOpen: false
        };
        this.getExtensions(this.state.projectId);
        this.addEventListeners();
    }
    componentDidUpdate (prevProps) {
        if (this.props.sessionStatus !== prevProps.sessionStatus &&
            this.props.sessionStatus === sessionActions.Status.FETCHED &&
            this.state.projectId) {
            if (this.props.user) {
                const username = this.props.user.username;
                const token = this.props.user.token;
                this.props.getTopLevelComments(this.state.projectId, this.props.comments.length);
                this.props.getProjectInfo(this.state.projectId, token);
                this.props.getRemixes(this.state.projectId, token);
                this.props.getProjectStudios(this.state.projectId, token);
                this.props.getCuratedStudios(username);
                this.props.getFavedStatus(this.state.projectId, username, token);
                this.props.getLovedStatus(this.state.projectId, username, token);
            } else {
                this.props.getTopLevelComments(this.state.projectId, this.props.comments.length);
                this.props.getProjectInfo(this.state.projectId);
                this.props.getRemixes(this.state.projectId);
                this.props.getProjectStudios(this.state.projectId);
            }
        }
        if (this.props.projectInfo.id !== prevProps.projectInfo.id) {
            this.getExtensions(this.state.projectId);
            this.initCounts(this.props.projectInfo.stats.favorites, this.props.projectInfo.stats.loves);
            this.handlePermissions();
            if (this.props.projectInfo.remix.parent !== null) {
                this.props.getParentInfo(this.props.projectInfo.remix.parent);
            }
            if (this.props.projectInfo.remix.root !== null &&
                this.props.projectInfo.remix.root !== this.props.projectInfo.remix.parent
            ) {
                this.props.getOriginalInfo(this.props.projectInfo.remix.root);
            }
        }
        if (this.props.playerMode !== prevProps.playerMode || this.props.fullScreen !== prevProps.fullScreen) {
            this.pushHistory(history.state === null);
        }
    }
    componentWillUnmount () {
        this.removeEventListeners();
    }
    addEventListeners () {
        window.addEventListener('popstate', this.handlePopState);
    }
    removeEventListeners () {
        window.removeEventListener('popstate', this.handlePopState);
    }
    getExtensions (projectId) {
        storage
            .load(storage.AssetType.Project, projectId, storage.DataFormat.JSON)
            .then(projectAsset => { // NOTE: this is turning up null, breaking the line below.
                let input = projectAsset.data;
                if (typeof input === 'object' && !(input instanceof ArrayBuffer) &&
                !ArrayBuffer.isView(input)) { // taken from scratch-vm
                    // If the input is an object and not any ArrayBuffer
                    // or an ArrayBuffer view (this includes all typed arrays and DataViews)
                    // turn the object into a JSON string, because we suspect
                    // this is a project.json as an object
                    // validate expects a string or buffer as input
                    // TODO not sure if we need to check that it also isn't a data view
                    input = JSON.stringify(input);
                }
                parser(projectAsset.data, false, (err, projectData) => {
                    if (err) {
                        log.error(`Unhandled project parsing error: ${err}`);
                        return;
                    }
                    const extensionSet = new Set();
                    if (projectData[0].extensions) {
                        projectData[0].extensions.forEach(extension => {
                            extensionSet.add(EXTENSION_INFO[extension]);
                        });
                    }
                    this.setState({
                        extensions: Array.from(extensionSet)
                    });
                });
            });
    }
    // Temporarily duplicated this function from navigation.jsx here.
    // Should move handling of login/logout into session.js, and handle them
    // from here as well as navigation.jsx.
    handleLogout (e) {
        e.preventDefault();
        api({
            host: '',
            method: 'post',
            uri: '/accounts/logout/',
            useCsrf: true
        }, err => {
            if (err) log.error(err);
            window.location = '/';
        });
    }
    handleReportClick () {
        this.setState({reportOpen: true});
    }
    handleReportClose () {
        this.setState({reportOpen: false});
    }
    handleAddToStudioClick () {
        this.setState({addToStudioOpen: true});
    }
    handleAddToStudioClose () {
        this.setState({addToStudioOpen: false});
    }
    handleReportSubmit (formData) {
        this.props.reportProject(this.state.projectId, formData);
    }
    handlePopState () {
        const path = window.location.pathname.toLowerCase();
        const playerMode = path.indexOf('editor') === -1;
        const fullScreen = path.indexOf('fullscreen') !== -1;
        if (this.props.playerMode !== playerMode) {
            this.props.setPlayer(playerMode);
        }
        if (this.props.fullScreen !== fullScreen) {
            this.props.setFullScreen(fullScreen);
        }
    }
    pushHistory (push) {
        // update URI to match mode
        const idPath = this.state.projectId ? `${this.state.projectId}/` : '';
        let modePath = '';
        if (!this.props.playerMode) modePath = 'editor/';
        // fullscreen overrides editor
        if (this.props.fullScreen) modePath = 'fullscreen/';
        const newPath = `/preview/${idPath}${modePath}`;
        if (push) {
            history.pushState(
                {},
                document.title,
                newPath
            );
        } else {
            history.replaceState(
                {},
                document.title,
                newPath
            );
        }
    }
    handleToggleStudio (id) {
        const studioId = parseInt(id, 10);
        if (isNaN(studioId)) { // sanity check in case event had no integer data-id
            return;
        }
        const studio = this.props.studios.find(thisStudio => (thisStudio.id === studioId));
        // only send add or leave request to server if we know current status
        if ((typeof studio !== 'undefined') && ('includesProject' in studio)) {
            this.props.toggleStudio(
                (studio.includesProject === false),
                studioId,
                this.props.projectInfo.id,
                this.props.user.token
            );
        }
    }
    handleFavoriteToggle () {
        this.props.setFavedStatus(
            !this.props.faved,
            this.props.projectInfo.id,
            this.props.user.username,
            this.props.user.token
        );
        if (this.props.faved) {
            this.setState(state => ({
                favoriteCount: state.favoriteCount - 1
            }));
        } else {
            this.setState(state => ({
                favoriteCount: state.favoriteCount + 1
            }));
        }
    }
    handleLoadMore () {
        this.props.getTopLevelComments(this.state.projectId, this.props.comments.length);
    }
    handleLoveToggle () {
        this.props.setLovedStatus(
            !this.props.loved,
            this.props.projectInfo.id,
            this.props.user.username,
            this.props.user.token
        );
        if (this.props.loved) {
            this.setState(state => ({
                loveCount: state.loveCount - 1
            }));
        } else {
            this.setState(state => ({
                loveCount: state.loveCount + 1
            }));
        }
    }
    handlePermissions () {
        // TODO: handle admins and mods
        if (this.props.projectInfo.author.username === this.props.user.username) {
            this.setState({editable: true});
        }
    }
    handleSeeInside () {
        this.props.setPlayer(false);
    }
    handleUpdate (jsonData) {
        this.props.updateProject(
            this.props.projectInfo.id,
            jsonData,
            this.props.user.username,
            this.props.user.token
        );
    }
    handleUpdateProjectTitle (title) {
        this.handleUpdate({
            title: title
        });
    }
    initCounts (favorites, loves) {
        this.setState({
            favoriteCount: favorites,
            loveCount: loves
        });
    }
    isShared () {
        return (
            // if we don't have projectInfo assume shared until we know otherwise
            Object.keys(this.props.projectInfo).length === 0 || (
                this.props.projectInfo.history &&
                this.props.projectInfo.history.shared.length > 0
            )
        );
    }
    isLoggedIn () {
        return (
            this.props.sessionStatus === sessionActions.Status.FETCHED &&
            Object.keys(this.props.user).length > 0
        );
    }
    userOwnsProject () {
        return (
            this.isLoggedIn() &&
            Object.keys(this.props.projectInfo).length > 0 &&
            this.props.user.id === this.props.projectInfo.author.id
        );
    }
    render () {
        return (
            this.props.playerMode ?
                <Page>
                    <PreviewPresentation
                        addToStudioOpen={this.state.addToStudioOpen}
                        assetHost={this.props.assetHost}
                        backpackOptions={this.props.backpackOptions}
                        comments={this.props.comments}
                        editable={this.state.editable}
                        extensions={this.state.extensions}
                        faved={this.props.faved}
                        favoriteCount={this.state.favoriteCount}
                        isFullScreen={this.state.isFullScreen}
                        isLoggedIn={this.isLoggedIn()}
                        isShared={this.isShared()}
                        loveCount={this.state.loveCount}
                        loved={this.props.loved}
                        originalInfo={this.props.original}
                        parentInfo={this.props.parent}
                        projectHost={this.props.projectHost}
                        projectId={this.state.projectId}
                        projectInfo={this.props.projectInfo}
                        projectStudios={this.props.projectStudios}
                        remixes={this.props.remixes}
                        replies={this.props.replies}
                        reportOpen={this.state.reportOpen}
                        studios={this.props.studios}
                        userOwnsProject={this.userOwnsProject()}
                        onAddToStudioClicked={this.handleAddToStudioClick}
                        onAddToStudioClosed={this.handleAddToStudioClose}
                        onFavoriteClicked={this.handleFavoriteToggle}
                        onLoadMore={this.handleLoadMore}
                        onLoveClicked={this.handleLoveToggle}
                        onReportClicked={this.handleReportClick}
                        onReportClose={this.handleReportClose}
                        onReportSubmit={this.handleReportSubmit}
                        onSeeInside={this.handleSeeInside}
                        onToggleStudio={this.handleToggleStudio}
                        onUpdate={this.handleUpdate}
                    />
                </Page> :
                <IntlGUI
                    enableCommunity
                    hideIntro
                    assetHost={this.props.assetHost}
                    backpackOptions={this.props.backpackOptions}
                    basePath="/"
                    className="gui"
                    projectHost={this.props.projectHost}
                    projectId={this.state.projectId}
                    projectTitle={this.props.projectInfo.title}
                    onClickLogout={this.handleLogout}
                    onUpdateProjectTitle={this.handleUpdateProjectTitle}
                />
        );
    }
}

Preview.propTypes = {
    assetHost: PropTypes.string.isRequired,
    backpackOptions: PropTypes.shape({
        host: PropTypes.string,
        visible: PropTypes.bool
    }),
    comments: PropTypes.arrayOf(PropTypes.object),
    faved: PropTypes.bool,
    fullScreen: PropTypes.bool,
    getCuratedStudios: PropTypes.func.isRequired,
    getFavedStatus: PropTypes.func.isRequired,
    getLovedStatus: PropTypes.func.isRequired,
    getOriginalInfo: PropTypes.func.isRequired,
    getParentInfo: PropTypes.func.isRequired,
    getProjectInfo: PropTypes.func.isRequired,
    getProjectStudios: PropTypes.func.isRequired,
    getRemixes: PropTypes.func.isRequired,
    getTopLevelComments: PropTypes.func.isRequired,
    loved: PropTypes.bool,
    original: projectShape,
    parent: projectShape,
    playerMode: PropTypes.bool,
    projectHost: PropTypes.string.isRequired,
    projectInfo: projectShape,
    projectStudios: PropTypes.arrayOf(PropTypes.object),
    remixes: PropTypes.arrayOf(PropTypes.object),
    replies: PropTypes.objectOf(PropTypes.array),
    reportProject: PropTypes.func,
    sessionStatus: PropTypes.string,
    setFavedStatus: PropTypes.func.isRequired,
    setFullScreen: PropTypes.func.isRequired,
    setLovedStatus: PropTypes.func.isRequired,
    setPlayer: PropTypes.func.isRequired,
    studios: PropTypes.arrayOf(PropTypes.object),
    toggleStudio: PropTypes.func.isRequired,
    updateProject: PropTypes.func.isRequired,
    user: PropTypes.shape({
        id: PropTypes.number,
        banned: PropTypes.bool,
        username: PropTypes.string,
        token: PropTypes.string,
        thumbnailUrl: PropTypes.string,
        dateJoined: PropTypes.string,
        email: PropTypes.string,
        classroomId: PropTypes.string
    })
};

Preview.defaultProps = {
    assetHost: process.env.ASSET_HOST,
    backpackOptions: {
        host: process.env.BACKPACK_HOST,
        visible: true
    },
    projectHost: process.env.PROJECT_HOST,
    sessionStatus: sessionActions.Status.NOT_FETCHED,
    user: {}
};

// Build consolidated curatedStudios object from all studio info.
// We add flags to indicate whether the project is currently in the studio,
// and the status of requests to join/leave studios.
const consolidateStudiosInfo = (curatedStudios, projectStudios, currentStudioIds, studioRequests) => {
    const consolidatedStudios = [];

    projectStudios.forEach(projectStudio => {
        const includesProject = (currentStudioIds.indexOf(projectStudio.id) !== -1);
        const consolidatedStudio =
            Object.assign({}, projectStudio, {includesProject: includesProject});
        consolidatedStudios.push(consolidatedStudio);
    });

    // copy the curated studios that project is not in
    curatedStudios.forEach(curatedStudio => {
        if (!projectStudios.some(projectStudio => (projectStudio.id === curatedStudio.id))) {
            const includesProject = (currentStudioIds.indexOf(curatedStudio.id) !== -1);
            const consolidatedStudio =
                Object.assign({}, curatedStudio, {includesProject: includesProject});
            consolidatedStudios.push(consolidatedStudio);
        }
    });

    // set studio state to hasRequestOutstanding==true if it's being fetched,
    // false if it's not
    consolidatedStudios.forEach(consolidatedStudio => {
        const id = consolidatedStudio.id;
        consolidatedStudio.hasRequestOutstanding =
            ((id in studioRequests) &&
           (studioRequests[id] === previewActions.Status.FETCHING));
    });
    return consolidatedStudios;
};

const mapStateToProps = state => ({
    comments: state.preview.comments,
    faved: state.preview.faved,
    loved: state.preview.loved,
    original: state.preview.original,
    parent: state.preview.parent,
    remixes: state.preview.remixes,
    replies: state.preview.replies,
    sessionStatus: state.session.status,
    projectInfo: state.preview.projectInfo,
    projectStudios: state.preview.projectStudios,
    studios: consolidateStudiosInfo(state.preview.curatedStudios,
        state.preview.projectStudios, state.preview.currentStudioIds,
        state.preview.status.studioRequests),
    user: state.session.session.user,
    playerMode: state.scratchGui.mode.isPlayerOnly,
    fullScreen: state.scratchGui.mode.isFullScreen
});

const mapDispatchToProps = dispatch => ({
    getOriginalInfo: id => {
        dispatch(previewActions.getOriginalInfo(id));
    },
    getParentInfo: id => {
        dispatch(previewActions.getParentInfo(id));
    },
    getProjectInfo: (id, token) => {
        dispatch(previewActions.getProjectInfo(id, token));
    },
    getRemixes: id => {
        dispatch(previewActions.getRemixes(id));
    },
    getProjectStudios: id => {
        dispatch(previewActions.getProjectStudios(id));
    },
    getCuratedStudios: (username, token) => {
        dispatch(previewActions.getCuratedStudios(username, token));
    },
    toggleStudio: (isAdd, studioId, id, token) => {
        if (isAdd === true) {
            dispatch(previewActions.addToStudio(studioId, id, token));
        } else {
            dispatch(previewActions.leaveStudio(studioId, id, token));
        }
    },
    getTopLevelComments: (id, offset) => {
        dispatch(previewActions.getTopLevelComments(id, offset));
    },
    getFavedStatus: (id, username, token) => {
        dispatch(previewActions.getFavedStatus(id, username, token));
    },
    setFavedStatus: (faved, id, username, token) => {
        dispatch(previewActions.setFavedStatus(faved, id, username, token));
    },
    getLovedStatus: (id, username, token) => {
        dispatch(previewActions.getLovedStatus(id, username, token));
    },
    setLovedStatus: (loved, id, username, token) => {
        dispatch(previewActions.setLovedStatus(loved, id, username, token));
    },
    refreshSession: () => {
        dispatch(sessionActions.refreshSession());
    },
    reportProject: (id, formData) => {
        dispatch(previewActions.reportProject(id, formData));
    },
    setOriginalInfo: info => {
        dispatch(previewActions.setOriginalInfo(info));
    },
    setParentInfo: info => {
        dispatch(previewActions.setParentInfo(info));
    },
    updateProject: (id, formData, username, token) => {
        dispatch(previewActions.updateProject(id, formData, username, token));
    },
    setPlayer: player => {
        dispatch(GUI.setPlayer(player));
    },
    setFullScreen: fullscreen => {
        dispatch(GUI.setFullScreen(fullscreen));
    }
});

const ConnectedPreview = connect(
    mapStateToProps,
    mapDispatchToProps
)(Preview);

GUI.setAppElement(document.getElementById('app'));
const initGuiState = guiInitialState => {
    const pathname = window.location.pathname.toLowerCase();
    const parts = pathname.split('/').filter(Boolean);
    // parts[0]: 'preview'
    // parts[1]: either :id or 'editor'
    // parts[2]: undefined if no :id, otherwise either 'editor' or 'fullscreen'
    if (parts.indexOf('editor') === -1) {
        guiInitialState = GUI.initPlayer(guiInitialState);
    }
    if (parts.indexOf('fullscreen') !== -1) {
        guiInitialState = GUI.initFullScreen(guiInitialState);
    }
    return guiInitialState;
};

render(
    <ConnectedPreview />,
    document.getElementById('app'),
    {
        preview: previewActions.previewReducer,
        ...GUI.guiReducers
    },
    {scratchGui: initGuiState(GUI.guiInitialState)},
    GUI.guiMiddleware
);
