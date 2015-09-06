set -e
set -v

export REPORTS_BASE=`echo ~`/reports
source /etc/ENVIRONMENT_VARIABLES.sh || echo "no environment variables file.. skipping.. "
DEV_ENV_VARS="/vagrant/dev/ENVIRONMENT_VARIABLES.sh"
if [ -f  "$DEV_ENV_VARS" ]; then
    echo "development environment variables exist. reading them"
    source $DEV_ENV_VARS
else
    echo "developmnet environment variables does not exist. skipping..."
fi

if [ ! -f /usr/bin/git ]; then
    echo "installing git"
    sudo yum install git -y
else
    echo "git already installed"
fi

if [ ! -f /usr/bin/node ];then
    echo "installing node"
    NODEJS_VERSION=0.10.35
    NODEJS_HOME=/opt/nodejs
    sudo mkdir -p $NODEJS_HOME
    sudo chown $USER:$USER $NODEJS_HOME
    curl --fail --silent http://nodejs.org/dist/v${NODEJS_VERSION}/node-v${NODEJS_VERSION}-linux-x64.tar.gz -o /tmp/nodejs.tar.gz
    tar -xzf /tmp/nodejs.tar.gz -C ${NODEJS_HOME} --strip-components=1
    sudo ln -s /opt/nodejs/bin/node /usr/bin/node
    sudo ln -s /opt/nodejs/bin/npm /usr/bin/npm

else
    echo "node already installed"
fi

GIT_DEST="cloudify-grafana"


## seems like some images don't have required libraries.. we will try to fix them
## commented out lines are lines that answers online suggest we should use, but build passes without them.
## we keep them here for future references just in case future images break, so we don't need to research again.
## the 'if' might be incorrect, but we try to invoke these commands only when needed. not using brute force to make build as fast as possible.
## so everything will undergo fine-tuning as we progress.



if [ ! -f /usr/lib64/libfreetype.so.6 ] || [ ! -f /usr/lib64/libfontconfig.so.1 ];then
    echo "fixing centos image : installing libfreetype.so.6 for phantomjs"
    sudo yum install freetype fontconfig -y

    # sudo yum update -y
    # sudo yum update libX11-devel -y

else
    echo "libfreetype is present.. moving on.."
fi

if [ ! -f /usr/bin/bzip2 ]; then
    sudo yum install -y bzip2
else
    echo "bzip2 exists. skipping..."
fi


if [ "$SKIP_BUILD" == "" ];then # for development purposes
    if [ "$UPDATE_CLONE" != "" ]; then
        echo "updating clone"
        rm -rf $GIT_DEST
    else
        echo "not updating clone.."
    fi

    set +e; set +v;
     GIT_URL="https://$GITHUB_USER:$GITHUB_TOKEN@github.com/cloudify-cosmo/cloudify-grafana.git"
    git clone $GIT_URL $GIT_DEST

    set -e; set -v;

    cd $GIT_DEST
    echo "installing preprequirements"
    sudo npm run install_prereq
    npm run build_and_publish
else
    echo "skipping build"
fi



